import { Router } from "express";
import ExcelJS from "exceljs";
import { Lead } from "../models/Lead";
import { Activity } from "../models/Activity";
import { Call } from "../models/Call";
import { FollowUp } from "../models/FollowUp";
import { User } from "../models/User";
import { BusinessProject } from "../models/BusinessProject";
import { auth, roles } from "../middleware/auth";
import { logActivity } from "../utils/activity";
import { Notification } from "../models/Notification";
import { remapUnmappedLeads } from "../services/leadRemap.service";
import { Note } from "../models/Note";
import { SavedView } from "../models/SavedView";
import { escapeRegex } from "../utils/regex";
import { getBusinessOwnerProjectIds, salesBelongsToProject } from "../utils/tenant";
import { refreshLeadScore } from "../utils/scoring";
import { normalizePhone, phoneTail } from "../utils/phone";
import { emitLeadEvent } from "../sockets";
import { validateBody, objectId, z } from "../middleware/validate";
import { Types } from "mongoose";
import { visibleLeadFilter, canAccessLead, leadScope } from "../utils/leadAccess";

const r = Router();

const VALID_STATUSES = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "FOLLOW_UP",
  "SCHEDULED",
  "WON",
  "LOST",
  "NOT_INTERESTED",
];

function buildSearch(search: string) {
  const rx = { $regex: escapeRegex(search), $options: "i" };
  return [
    { name: rx },
    { email: rx },
    { phone: rx },
    { source: rx },
    { campaign: rx },
    { formName: rx },
    { tags: rx },
    { "meta.pageId": rx },
    { "meta.pageName": rx },
    { "meta.fieldData.values": rx },
  ];
}

/**
 * Optional list filters shared by the list, board and export endpoints.
 * Scope (who can see what) is applied first by visibleLeadFilter and is never widened here.
 */
function applyListFilters(q: any, query: Record<string, string>, req: any) {
  const { search, status, source, assignedTo, dateFrom, dateTo, scoreMin, unassigned, tag, followup, uncontacted, city, product } = query;
  if (status && VALID_STATUSES.includes(status)) q.status = status;
  if (source) q.source = String(source).slice(0, 40);
  if (tag) q.tags = String(tag).slice(0, 40);
  if (city) q.city = String(city).slice(0, 60);
  if (product) q.interestedProduct = String(product).slice(0, 60);

  const canFilterBySales = ["ADMIN", "MANAGER", "BUSINESS"].includes(req.user?.role);
  if (canFilterBySales && assignedTo && Types.ObjectId.isValid(assignedTo)) q.assignedTo = assignedTo;
  if (canFilterBySales && unassigned === "true") q.assignedTo = { $exists: false };

  const created: Record<string, Date> = {};
  if (dateFrom && !Number.isNaN(Date.parse(dateFrom))) created.$gte = new Date(dateFrom);
  if (dateTo && !Number.isNaN(Date.parse(dateTo))) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    created.$lte = end;
  }
  if (Object.keys(created).length) q.createdAt = created;

  if (scoreMin && Number.isFinite(Number(scoreMin))) q.score = { $gte: Number(scoreMin) };
  if (uncontacted === "true") {
    q.status = "NEW";
    q.lastContactAt = { $exists: false };
  }
  if (followup === "overdue") q.nextFollowUpAt = { $lt: new Date() };
  if (followup === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    q.nextFollowUpAt = { $gte: start, $lt: end };
  }

  if (search && String(search).trim()) {
    const or = buildSearch(String(search).trim());
    if (q.$or) {
      q.$and = [...(q.$and || []), { $or: q.$or }, { $or: or }];
      delete q.$or;
    } else q.$or = or;
  }
  return q;
}

/** Find an existing lead with the same phone/email inside the same business. */
async function findDuplicate(input: { phone?: string; email?: string; business?: unknown; excludeId?: unknown }) {
  const or: any[] = [];
  const tail = phoneTail(input.phone);
  if (tail) or.push({ phone: { $regex: `${tail}$` } });
  if (input.email) or.push({ email: { $regex: `^${escapeRegex(input.email)}$`, $options: "i" } });
  if (!or.length) return null;
  const q: any = { $or: or };
  if (input.business) q.business = input.business;
  if (input.excludeId) q._id = { $ne: input.excludeId };
  return Lead.findOne(q).sort({ createdAt: 1 }).select("_id name phone email status assignedTo createdAt").lean();
}

r.get("/stats", auth, async (req, res) => {
  const match = await visibleLeadFilter(req);


  const [total, newCount, interested, followups, won, lost, held] =
    await Promise.all([
      Lead.countDocuments(match),
      Lead.countDocuments({ ...match, status: "NEW" }),
      Lead.countDocuments({ ...match, status: "INTERESTED" }),
      Lead.countDocuments({ ...match, status: "FOLLOW_UP" }),
      Lead.countDocuments({ ...match, status: "WON" }),
      Lead.countDocuments({ ...match, status: "LOST" }),
      req.user?.role === "ADMIN"
        ? Lead.countDocuments({ ...match, deliveryStatus: "HELD" })
        : Promise.resolve(0),
    ]);

  res.json({
    total,
    newCount,
    interested,
    followups,
    won,
    lost,
    held,
  });
});

/**
 * GET /api/leads/product-options
 * Distinct product types present on the leads the caller can see — used to
 * populate the product filter dropdown (web + mobile).
 */
r.get("/product-options", auth, async (req, res) => {
  const match = await visibleLeadFilter(req);
  const values = await Lead.distinct("interestedProduct", { ...match, interestedProduct: { $nin: [null, ""] } });
  const products = (values as string[]).filter(Boolean).sort((a, b) => a.localeCompare(b));
  res.json({ products });
});

/**
 * GET /api/leads
 * List only the leads the authenticated user is allowed to see.
 */
r.get("/", auth, async (req, res) => {
  const { page = "1", limit = "20", sort = "newest" } = req.query as Record<string, string>;
  const sortSpec: Record<string, 1 | -1> =
    sort === "score" ? { score: -1, createdAt: -1 }
    : sort === "oldest" ? { createdAt: 1 }
    : sort === "followup" ? { nextFollowUpAt: 1 }
    : sort === "product" ? { interestedProduct: 1, createdAt: -1 }
    : sort === "size_desc" || sort === "price_desc" ? { interestedProduct: 1, createdAt: -1 }
    : { createdAt: -1 };

  const q: any = applyListFilters(await visibleLeadFilter(req), req.query as Record<string, string>, req);

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));

  // The list never needs the raw Meta payload; non-admins don't get Meta ids either.
  const isAdminViewer = req.user!.role === "ADMIN" || req.user!.role === "MANAGER";
  const listProjection = isAdminViewer
    ? "-meta.rawPayload"
    : "-meta.rawPayload -meta.pageId -meta.pageName -meta.adId -meta.adSetId -meta.campaignId -meta.adAccountId -meta.formId -meta.businessId -metaLeadId";

  const [leads, total] = await Promise.all([
    Lead.find(q)
      .select(listProjection)
      .populate("assignedTo", "name email")
      .populate({
        path: "businessProject",
        select: "name stage documents products business",
        populate: { path: "business", select: "name contactNo email status" },
      })
      .sort(sortSpec)
      .skip((p - 1) * l)
      .limit(l),
    Lead.countDocuments(q),
  ]);

  res.json({
    leads,
    total,
    page: p,
    pages: Math.ceil(total / l),
  });
});

/**
 * GET /api/leads/export
 * Download an Excel file of leads using exceljs, scoped to user permissions and active filters.
 */
r.get("/export", auth, async (req, res) => {
  const q: any = applyListFilters(await visibleLeadFilter(req), req.query as Record<string, string>, req);

  const leads = await Lead.find(q)
    .populate("assignedTo", "name email")
    .populate({ path: "businessProject", select: "name stage location reraNumber business", populate: { path: "business", select: "name contactNo" } })
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LeadFlow CRM";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Leads");

  worksheet.columns = [
    { header: "Lead Name", key: "name", width: 24 },
    { header: "Phone", key: "phone", width: 18 },
    { header: "Email", key: "email", width: 28 },
    { header: "Business / Project", key: "business", width: 24 },
    { header: "Status", key: "status", width: 16 },
    { header: "Contact Status", key: "contactStatus", width: 16 },
    { header: "Assigned To", key: "assignedTo", width: 20 },
    { header: "Source", key: "source", width: 16 },
    { header: "Campaign", key: "campaign", width: 22 },
    { header: "Form Name", key: "formName", width: 22 },
    { header: "Next Follow-up", key: "nextFollowUpAt", width: 22 },
    { header: "Created At", key: "createdAt", width: 22 },
    { header: "Updated At", key: "updatedAt", width: 22 },
    { header: "Extra Details", key: "extraDetails", width: 36 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E293B" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "left" };
  headerRow.height = 24;

  const EXCLUDED_EXTRA_KEYS = new Set([
    "full_name", "name", "email", "phone_number", "phone", "contact",
    "lead_id", "leadgen_id", "id", "page_id", "page_name", "form_id",
    "form_name", "ad_id", "adset_id", "campaign_id", "campaign_name",
    "created_at", "created_time", "platform", "ad_account_id"
  ]);

  for (const l of leads as any[]) {
    const extraEntries: string[] = [];
    if (l.meta?.formData && typeof l.meta.formData === "object") {
      for (const [k, v] of Object.entries(l.meta.formData)) {
        if (!EXCLUDED_EXTRA_KEYS.has(k.toLowerCase()) && v !== null && v !== undefined && String(v).trim()) {
          extraEntries.push(`${k.replace(/_/g, " ")}: ${String(v).replace(/_/g, " ")}`);
        }
      }
    }
    if (!extraEntries.length && Array.isArray(l.meta?.fieldData)) {
      for (const f of l.meta.fieldData) {
        if (f?.name && !EXCLUDED_EXTRA_KEYS.has(String(f.name).toLowerCase())) {
          const val = Array.isArray(f.values) ? f.values.join(", ") : String(f.values ?? "");
          if (val.trim()) {
            extraEntries.push(`${String(f.name).replace(/_/g, " ")}: ${val.replace(/_/g, " ")}`);
          }
        }
      }
    }
    const extras = extraEntries.join("; ");

    const row = worksheet.addRow({
      name: l.name || "Unnamed lead",
      phone: l.phone || "",
      email: l.email || "",
      business:
        (l.businessProject as any)?.business?.name && (l.businessProject as any)?.name
          ? `${(l.businessProject as any).name} (${(l.businessProject as any).business.name})`
          : (l.businessProject as any)?.name || (l.businessProject as any)?.business?.name || l.meta?.businessId || "Unmapped",
      status: l.status || "NEW",
      contactStatus: l.contactStatus || "",
      assignedTo: l.assignedTo?.name || "Unassigned",
      source: l.source || "",
      campaign: l.campaign || "",
      formName: l.formName || "",
      nextFollowUpAt: l.nextFollowUpAt
        ? new Date(l.nextFollowUpAt).toLocaleString()
        : "",
      createdAt: l.createdAt ? new Date(l.createdAt).toLocaleString() : "",
      updatedAt: l.updatedAt ? new Date(l.updatedAt).toLocaleString() : "",
      extraDetails: extras,
    });
    row.alignment = { vertical: "middle" };
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="leads-${dateStr}.xlsx"`,
  );

  await workbook.xlsx.write(res);
  res.end();
});


/**
 * GET /api/leads/board
 * Kanban pipeline: leads grouped by status (newest first, capped per column).
 */
r.get("/board", auth, async (req, res) => {
  const perColumn = Math.min(100, Math.max(5, Number(req.query.perColumn) || 30));
  const base: any = applyListFilters(await visibleLeadFilter(req), { ...(req.query as Record<string, string>), status: "" }, req);

  const columns = await Promise.all(
    VALID_STATUSES.map(async (status) => {
      const q = { ...base, status };
      const [leads, total] = await Promise.all([
        Lead.find(q)
          .select("name phone email status score source campaign assignedTo businessProject nextFollowUpAt createdAt dealValue tags")
          .populate("assignedTo", "name")
          .populate("businessProject", "name")
          .sort({ score: -1, createdAt: -1 })
          .limit(perColumn)
          .lean(),
        Lead.countDocuments(q),
      ]);
      return { status, total, leads };
    }),
  );

  res.json({ columns });
});

/**
 * GET /api/leads/my-day
 * Focus list for the signed-in user: overdue follow-ups, today's agenda,
 * uncontacted new leads and SLA breaches — all within the user's own scope.
 */
r.get("/my-day", auth, async (req, res) => {
  const scope: any = await visibleLeadFilter(req);
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  const slaCutoff = new Date(now.getTime() - Number(process.env.LEAD_SLA_MINUTES || 15) * 60_000);

  const isPlatformWide =
    (req.user!.role === "ADMIN" || req.user!.role === "MANAGER") && !req.query.business && !req.query.businessProject;
  const followupBase: any = { status: "PENDING" };
  if (!isPlatformWide) followupBase.lead = { $in: await Lead.distinct("_id", scope) };
  if (req.user!.role === "SALES") followupBase.user = req.user!.id;

  const leadFields = "name phone email status score source campaign createdAt nextFollowUpAt businessProject assignedTo";

  const [overdue, today, uncontacted, slaBreached, wonThisMonth, counts] = await Promise.all([
    FollowUp.find({ ...followupBase, scheduledAt: { $lt: now } })
      .populate("lead", "name phone status")
      .sort({ scheduledAt: 1 })
      .limit(50)
      .lean(),
    FollowUp.find({ ...followupBase, scheduledAt: { $gte: now, $lt: endOfDay } })
      .populate("lead", "name phone status")
      .sort({ scheduledAt: 1 })
      .limit(50)
      .lean(),
    Lead.find({ ...scope, status: "NEW", lastContactAt: { $exists: false } })
      .select(leadFields)
      .populate("businessProject", "name")
      .populate("assignedTo", "name")
      .sort({ createdAt: -1 })
      .limit(30)
      .lean(),
    Lead.countDocuments({ ...scope, status: "NEW", lastContactAt: { $exists: false }, createdAt: { $lt: slaCutoff } }),
    Lead.countDocuments({
      ...scope,
      status: "WON",
      updatedAt: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) },
    }),
    Call.countDocuments({ user: req.user!.id, createdAt: { $gte: startOfDay } }),
  ]);

  res.json({
    overdue,
    today,
    uncontacted,
    stats: {
      overdueCount: overdue.length,
      todayCount: today.length,
      uncontactedCount: uncontacted.length,
      slaBreached,
      wonThisMonth,
      callsToday: counts,
      slaMinutes: Number(process.env.LEAD_SLA_MINUTES || 15),
    },
  });
});

/**
 * GET /api/leads/check-duplicate?phone=&email=
 * Used by the manual lead form to warn before creating a duplicate.
 */
r.get("/check-duplicate", auth, async (req, res) => {
  const scope: any = await visibleLeadFilter(req);
  const tail = phoneTail(req.query.phone);
  const email = String(req.query.email ?? "").trim();
  const or: any[] = [];
  if (tail) or.push({ phone: { $regex: `${tail}$` } });
  if (email) or.push({ email: { $regex: `^${escapeRegex(email)}$`, $options: "i" } });
  if (!or.length) return res.json({ duplicate: null });
  const duplicate = await Lead.findOne({ ...scope, $and: [{ $or: or }] })
    .select("_id name phone email status createdAt")
    .lean();
  res.json({ duplicate });
});

/** Saved list views (per user). */
r.get("/views", auth, async (req, res) => {
  const views = await SavedView.find({ user: req.user!.id }).sort({ createdAt: 1 }).lean();
  res.json({ views });
});

r.post(
  "/views",
  auth,
  validateBody(z.object({ name: z.string().trim().min(1).max(60), filters: z.record(z.string(), z.string().max(200)) })),
  async (req, res) => {
    const count = await SavedView.countDocuments({ user: req.user!.id });
    if (count >= 20) return res.status(400).json({ message: "You can save up to 20 views" });
    const view = await SavedView.create({ user: req.user!.id, name: req.body.name, filters: req.body.filters });
    res.status(201).json({ view });
  },
);

r.delete("/views/:viewId", auth, async (req, res) => {
  await SavedView.deleteOne({ _id: req.params.viewId, user: req.user!.id });
  res.json({ success: true });
});

/**
 * GET /api/leads/:id
 * Retrieve a single lead and all historical activities, calls, and follow-ups.
 */
r.get("/:id", auth, async (req, res) => {
  if (!(await canAccessLead(req, String(req.params.id)))) {
    return res
      .status(403)
      .json({ message: "You do not have access to this lead" });
  }

  const lead = await Lead.findById(req.params.id)
    .populate("assignedTo", "name email")
    .populate({ path: "businessProject", select: "name stage location reraNumber documents products ongoing upcoming completed business", populate: { path: "business", select: "name contactNo detail" } });

  if (!lead) {
    return res.status(404).json({ message: "Lead not found" });
  }

  const [activities, calls, followups, notes, duplicate] = await Promise.all([
    Activity.find({ lead: lead._id })
      .populate("actor", "name")
      .sort({ createdAt: -1 }),
    Call.find({ lead: lead._id })
      .populate("user", "name")
      .sort({ createdAt: -1 }),
    FollowUp.find({ lead: lead._id })
      .populate("user", "name")
      .sort({ createdAt: -1, updatedAt: -1 }),
    Note.find({ lead: lead._id })
      .populate("author", "name role profilePhotoUrl")
      .populate("mentions", "name role")
      .sort({ pinned: -1, createdAt: -1 })
      .limit(200)
      .lean(),
    lead.duplicateOf
      ? Lead.findById(lead.duplicateOf).select("_id name phone email status createdAt").lean()
      : Promise.resolve(null),
  ]);

  const isAdminViewer = req.user!.role === "ADMIN" || req.user!.role === "MANAGER";
  const leadOut: any = lead.toObject();
  if (!isAdminViewer) {
    // Partners and sales see the form answers, never Meta's internal ids or raw payload.
    leadOut.meta = { fieldData: leadOut.meta?.fieldData || [], formData: leadOut.meta?.formData || undefined };
    delete leadOut.metaLeadId;
  }
  res.json({ lead: leadOut, activities, calls, followups, notes, duplicate });
});

/**
 * GET /api/leads/:id/mentionable-users
 * Returns strictly the users related to this specific lead:
 * - The assigned salesperson (if any)
 * - The business owner/partner for the lead's business
 * - The sales team members assigned to the lead's business or project
 */
r.get("/:id/mentionable-users", auth, async (req, res) => {
  if (!(await canAccessLead(req, String(req.params.id)))) {
    return res.status(403).json({ message: "You do not have access to this lead" });
  }

  const lead = await Lead.findById(req.params.id).select("assignedTo business businessProject").lean();
  if (!lead) return res.status(404).json({ message: "Lead not found" });

  let businessId = lead.business ? String(lead.business) : undefined;
  if (!businessId && lead.businessProject) {
    const p = await BusinessProject.findById(lead.businessProject).select("business").lean();
    if (p?.business) businessId = String(p.business);
  }

  const orConditions: any[] = [];
  if (lead.assignedTo) {
    orConditions.push({ _id: lead.assignedTo });
  }

  if (businessId) {
    orConditions.push({ business: businessId });
  }

  if (lead.businessProject) {
    orConditions.push({ businessProject: lead.businessProject });
    orConditions.push({ assignedProjects: lead.businessProject });
  }

  if (!orConditions.length) {
    return res.json({ users: [] });
  }

  const users = await User.find({
    $or: orConditions,
    isActive: true,
    role: { $in: ["BUSINESS", "SALES"] },
  })
    .select("_id name email role business businessProject assignedProjects")
    .sort({ role: 1, name: 1 })
    .lean();

  res.json({ users });
});

/**
 * PATCH /api/leads/:id/status
 * Change the status of an accessible lead and write the audit trail.
 */
r.patch("/:id/status", auth, async (req, res) => {
  if (!(await canAccessLead(req, String(req.params.id)))) {
    return res
      .status(403)
      .json({ message: "You do not have access to this lead" });
  }

  if (!VALID_STATUSES.includes(req.body?.status)) {
    return res.status(400).json({ message: "Invalid lead status" });
  }

  const lostReason = String(req.body?.lostReason ?? "").trim().slice(0, 300);
  if ((req.body.status === "LOST" || req.body.status === "NOT_INTERESTED") && !lostReason) {
    return res.status(400).json({ message: "Please select a reason when marking a lead as lost or not interested" });
  }
  const dealValue = req.body?.dealValue !== undefined && req.body?.dealValue !== "" ? Number(req.body.dealValue) : undefined;
  if (dealValue !== undefined && (!Number.isFinite(dealValue) || dealValue < 0)) {
    return res.status(400).json({ message: "Deal value must be a positive number" });
  }

  const lead = await Lead.findById(req.params.id);

  if (!lead) {
    return res.status(404).json({ message: "Lead not found" });
  }

  const before = {
    status: lead.status,
    contactStatus: lead.contactStatus,
  };

  lead.status = req.body.status;
  lead.contactStatus = req.body.contactStatus ?? lead.contactStatus;
  if (lostReason && (lead.status === "LOST" || lead.status === "NOT_INTERESTED")) lead.lostReason = lostReason;
  if (req.body?.isFake !== undefined) {
    lead.isFake = Boolean(req.body.isFake);
    if (lead.isFake) {
      lead.status = "LOST";
      lead.lostReason = lostReason || "Fake lead";
      await FollowUp.updateMany(
        { lead: lead._id, status: "PENDING" },
        { status: "CANCELLED", outcome: "Lead marked as fake" }
      );
    }
  }
  if (dealValue !== undefined && lead.status === "WON") lead.dealValue = dealValue;
  if (lead.status !== "NEW" && !lead.firstContactAt) lead.firstContactAt = new Date();
  await lead.save();
  void refreshLeadScore(lead.id);

  await logActivity({
    lead: lead.id,
    actor: req.user!.id,
    type: "STATUS_CHANGED",
    title: "Lead status changed",
    description: `${before.status} → ${lead.status}${lostReason && lead.status !== "WON" ? ` · Reason: ${lostReason}` : ""}${dealValue !== undefined && lead.status === "WON" ? ` · Deal value: ${dealValue}` : ""}`,
  });

  emitLeadEvent(req.app.get("io"), "lead_updated", { lead: lead.toObject(), reason: "STATUS" }, await leadScope(lead._id));


  res.json({ lead });
});

/**
 * POST /api/leads/:id/mark-fake
 * Mark or unmark a lead as fake. Closes all pending follow-ups when marked fake.
 */
r.post("/:id/mark-fake", auth, async (req, res) => {
  if (!(await canAccessLead(req, String(req.params.id)))) {
    return res.status(403).json({ message: "You do not have access to this lead" });
  }

  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ message: "Lead not found" });

  const targetFake = req.body?.isFake !== undefined ? Boolean(req.body.isFake) : !Boolean(lead.isFake);
  lead.isFake = targetFake;

  if (targetFake) {
    lead.status = "LOST";
    lead.lostReason = req.body?.reason ? String(req.body.reason).trim() : "Fake lead";
    // Close/cancel all pending follow-ups for this lead
    await FollowUp.updateMany(
      { lead: lead._id, status: "PENDING" },
      { status: "CANCELLED", outcome: "Lead marked as fake lead" }
    );
  }
  await lead.save();

  await logActivity({
    lead: lead.id,
    actor: req.user!.id,
    type: "STATUS_CHANGED",
    title: targetFake ? "Marked as Fake Lead" : "Unmarked as Fake Lead",
    description: targetFake
      ? `Lead flagged as fake (${lead.lostReason}). All pending follow-ups cancelled.`
      : "Lead restored from fake status.",
  });

  const scope = await leadScope(lead._id);
  emitLeadEvent(req.app.get("io"), "lead_updated", { lead: lead.toObject(), reason: "FAKE" }, scope);
  emitLeadEvent(req.app.get("io"), "followup_updated", { leadId: lead._id }, scope);

  res.json({ lead, success: true });
});

/**
 * PATCH /api/leads/:id/assign
 * Admin manually assigns a released lead to a salesperson, bypassing automatic daily capacity.
 */
r.patch("/:id/assign", auth, roles("ADMIN", "MANAGER", "BUSINESS"), async (req, res) => {
  if (!(await canAccessLead(req, String(req.params.id)))) {
    return res.status(403).json({ message: "You do not have access to this lead" });
  }
  const lead = await Lead.findById(req.params.id);
  const user = await User.findOne({
    _id: req.body?.userId,
    role: "SALES",
    isActive: true,
  });

  if (!lead || !user) {
    return res
      .status(404)
      .json({ message: "Lead or active salesperson not found" });
  }

  if (lead.deliveryStatus !== "RELEASED") {
    return res
      .status(400)
      .json({
        message:
          "Held leads cannot be manually assigned until they are released",
      });
  }

  if (!(await salesBelongsToProject(user.id, lead.businessProject))) {
    return res.status(400).json({
      message: "This salesperson does not work on this lead's project. Assign the project to them first.",
    });
  }

  const before = lead.assignedTo;
  lead.assignedTo = user._id;
  lead.assignedAt = new Date();
  lead.assignmentSource = "MANUAL";
  await lead.save();

  await logActivity({
    lead: lead.id,
    actor: req.user!.id,
    type: "LEAD_REASSIGNED",
    title: "Lead reassigned",
    description: `Assigned to ${user.name}.`,
  });


  const io = req.app.get("io");

  // Assignment is an internal state change, not a user notification.
  // The lead notification is the only lead popup shown to users.
  emitLeadEvent(io, "lead_updated", { lead: lead.toObject(), reason: "ASSIGNED" }, await leadScope(lead._id));
  if (io && before && String(before) !== user.id) {
    io.to(`user:${String(before)}`).emit("lead_updated", { leadId: lead.id, reason: "UNASSIGNED" });
  }
  await Notification.create({
    user: user._id,
    type: "LEAD_ASSIGNED",
    title: "Lead assigned to you",
    message: `${lead.name}${lead.phone ? ` · ${lead.phone}` : ""} was assigned to you.`,
    entityType: "Lead",
    entityId: lead.id,
  });

  res.json({ lead });
});

/**
 * POST /api/leads/:id/calls
 * Record a call only against a lead visible to the current user.
 */
r.post("/:id/calls", auth, async (req, res) => {
  if (!(await canAccessLead(req, String(req.params.id)))) {
    return res
      .status(403)
      .json({ message: "You do not have access to this lead" });
  }

  const CALL_RESULTS = ["CONNECTED", "NOT_PICKED", "BUSY", "WRONG_NUMBER", "CALLBACK_REQUESTED"];
  if (!CALL_RESULTS.includes(req.body?.result)) {
    return res.status(400).json({ message: "Invalid call result" });
  }

  const call = await Call.create({
    lead: req.params.id,
    user: req.user!.id,
    result: req.body.result,
    durationSec: Number.isFinite(Number(req.body.durationSec)) ? Math.max(0, Math.min(6 * 3600, Math.round(Number(req.body.durationSec)))) : undefined,
    notes: req.body.notes,
    startedAt: req.body.startedAt ?? new Date(),
    endedAt: req.body.endedAt ?? new Date(),
  });

  const status = req.body.result === "NOT_PICKED" ? "FOLLOW_UP" : "CONTACTED";

  const existingLead = await Lead.findById(req.params.id).select("status firstContactAt").lean();
  const terminal = ["WON", "LOST", "NOT_INTERESTED", "INTERESTED", "SCHEDULED"].includes(String(existingLead?.status));
  await Lead.findByIdAndUpdate(req.params.id, {
    ...(terminal ? {} : { status }),
    lastContactAt: new Date(),
    ...(existingLead?.firstContactAt ? {} : { firstContactAt: new Date() }),
  });
  void refreshLeadScore(String(req.params.id));

  await logActivity({
    lead: req.params.id,
    actor: req.user!.id,
    type:
      req.body.result === "NOT_PICKED" ? "CALL_NOT_PICKED" : "CALL_COMPLETED",
    title: `Call: ${req.body.result}`,
    description: req.body.notes,
  });

  const populatedLead = await Lead.findById(req.params.id).select("name phone email source campaign status assignedTo").lean();
  const callMessage = `${populatedLead?.name || "Lead"} · Call ${String(req.body.result || "COMPLETED").replace(/_/g, " ").toLowerCase()}${req.body.notes ? ` · ${String(req.body.notes).trim()}` : ""}`;
  const recipients = await User.find({
    isActive: true,
    $or: [{ role: { $in: ["ADMIN", "MANAGER"] } }, { _id: req.user!.id }],
  }).select("_id").lean();
  if (recipients.length) {
    await Notification.insertMany(recipients.map((recipient) => ({
      user: recipient._id,
      type: "CALL_LOGGED",
      title: "Call logged",
      message: callMessage,
      entityType: "Lead",
      entityId: req.params.id,
    })));
  }

  const io = req.app.get("io");
  if (io && populatedLead) {
    const payload = { call: { ...call.toObject(), lead: populatedLead }, lead: populatedLead };
    const scope = await leadScope(req.params.id);
    emitLeadEvent(io, "call_logged", payload, { ...scope, assignedTo: scope.assignedTo || req.user!.id });
  }

  res.status(201).json({ call });
});

/**
 * POST /api/leads/:id/followups
 * Schedule a future follow-up for an accessible lead.
 */
r.post("/:id/followups", auth, async (req, res) => {
  if (!(await canAccessLead(req, String(req.params.id)))) {
    return res
      .status(403)
      .json({ message: "You do not have access to this lead" });
  }

  const scheduledAt = new Date(req.body.scheduledAt);

  if (Number.isNaN(scheduledAt.getTime())) {
    return res
      .status(400)
      .json({ message: "A valid follow-up date and time are required" });
  }

  if (scheduledAt.getTime() <= Date.now()) {
    return res
      .status(400)
      .json({ message: "Follow-up must be scheduled in the future" });
  }

  const leadForFollowup = await Lead.findById(req.params.id)
    .select("assignedTo name")
    .lean();

  if (!leadForFollowup) {
    return res.status(404).json({ message: "Lead not found" });
  }

  const requestedOwnerId = String(req.body?.userId ?? "").trim();
  const defaultOwnerId = leadForFollowup.assignedTo
    ? String(leadForFollowup.assignedTo)
    : req.user!.id;

  const followupUserId =
    req.user!.role === "ADMIN"
      ? (requestedOwnerId || defaultOwnerId)
      : (req.user!.role === "BUSINESS"
          ? (leadForFollowup.assignedTo ? String(leadForFollowup.assignedTo) : req.user!.id)
          : req.user!.id);

  const assignedUser = await User.findOne({
    _id: followupUserId,
    isActive: true,
    role: { $in: ["ADMIN", "MANAGER", "SALES", "BUSINESS"] },
  }).select("_id name email role");

  if (!assignedUser) {
    return res.status(400).json({ message: "Follow-up owner is invalid" });
  }

  const f = await FollowUp.create({
    lead: req.params.id,
    user: assignedUser._id,
    type: req.body.type ?? "CALL",
    scheduledAt,
    reminderAt: new Date(scheduledAt.getTime() - 24 * 60 * 60 * 1000),
    notes: req.body.notes,
  });

  await Lead.findByIdAndUpdate(req.params.id, {
    status: "FOLLOW_UP",
    nextFollowUpAt: f.scheduledAt,
  });

  await logActivity({
    lead: req.params.id,
    actor: req.user!.id,
    type: "FOLLOWUP_CREATED",
    title: "Follow-up scheduled",
    description: `${new Date(f.scheduledAt).toLocaleString()} · ${assignedUser.name}`,
  });

  const recipients = await User.find({
    isActive: true,
    $or: [
      { role: { $in: ["ADMIN", "MANAGER"] } },
      { _id: assignedUser._id },
    ],
  })
    .select("_id")
    .lean();

  const populatedFollowup = await FollowUp.findById(f._id)
    .populate("lead", "name email phone status")
    .populate("user", "name email role")
    .lean();

  const notificationMessage = `${populatedFollowup?.lead && typeof populatedFollowup.lead === "object" ? (populatedFollowup.lead as unknown as { name?: string }).name : leadForFollowup.name || "Lead"} · ${f.type} follow-up scheduled for ${new Date(f.scheduledAt).toLocaleString()} for ${assignedUser.name}.`;

  await Notification.insertMany(
    recipients.map((user) => ({
      user: user._id,
      type: "FOLLOWUP_CREATED",
      title: "Follow-up scheduled",
      message: notificationMessage,
      entityType: "Lead",
      entityId: req.params.id,
    })),
  );

  const io = req.app.get("io");

  void refreshLeadScore(String(req.params.id));
  if (io && populatedFollowup) {
    const payload = {
      followUp: populatedFollowup,
      action: "FOLLOWUP_CREATED",
      actorId: req.user!.id,
    };
    const scope = await leadScope(req.params.id);
    emitLeadEvent(io, "followup_updated", payload, { business: scope.business, assignedTo: assignedUser.id });
  }

  res.status(201).json({ followUp: populatedFollowup ?? f });
});

const leadInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  phone: z.string().trim().max(30).optional().default(""),
  email: z.union([z.string().trim().toLowerCase().email(), z.literal("")]).optional().default(""),
  businessProject: z.union([objectId, z.literal("")]).optional().default(""),
  source: z.enum(["MANUAL", "WALK_IN", "REFERRAL", "PHONE", "WEBSITE", "IMPORT", "OTHER"]).default("MANUAL"),
  campaign: z.string().trim().max(120).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
  tags: z.array(z.string().trim().min(1).max(40)).max(15).optional().default([]),
  assignedTo: z.union([objectId, z.literal("")]).optional().default(""),
});

/** Resolve which project ids the current user may create leads under. */
async function allowedProjectIdsForCreate(req: any): Promise<string[] | "ALL"> {
  if (req.user.role === "ADMIN" || req.user.role === "MANAGER") return "ALL";
  if (req.user.role === "BUSINESS") return (await getBusinessOwnerProjectIds(req.user)).map(String);
  return (req.user.assignedProjects || []).map(String);
}

async function createLeadFromInput(
  req: any,
  input: z.infer<typeof leadInputSchema>,
  opts: { skipDuplicates?: boolean } = {},
) {
  const allowed = await allowedProjectIdsForCreate(req);
  let projectId: string | undefined = input.businessProject || undefined;
  if (projectId && allowed !== "ALL" && !allowed.includes(projectId)) {
    throw Object.assign(new Error("You cannot add leads to this project"), { statusCode: 403 });
  }
  if (!projectId && allowed !== "ALL" && allowed.length === 1) projectId = allowed[0];
  if (!projectId && req.user.role !== "ADMIN" && req.user.role !== "MANAGER") {
    throw Object.assign(new Error("Select a project for this lead"), { statusCode: 400 });
  }

  const project: any = projectId ? await BusinessProject.findById(projectId).select("_id business name").lean() : null;
  if (projectId && !project) throw Object.assign(new Error("Project not found"), { statusCode: 400 });

  const phone = input.phone ? normalizePhone(input.phone) || input.phone : undefined;
  const duplicate = await findDuplicate({ phone, email: input.email || undefined, business: project?.business });
  if (duplicate && opts.skipDuplicates) return { lead: null, duplicate };

  // Owner: a SALES user creating a lead owns it; ADMIN/BUSINESS may pick a salesperson in scope.
  let assignee: string | undefined;
  if (req.user.role === "SALES") assignee = req.user.id;
  else if (input.assignedTo) {
    if (!(await salesBelongsToProject(input.assignedTo, project?._id))) {
      throw Object.assign(new Error("Selected salesperson does not work on this project"), { statusCode: 400 });
    }
    assignee = input.assignedTo;
  }

  const lead = await Lead.create({
    name: input.name,
    phone,
    email: input.email || undefined,
    source: input.source,
    campaign: input.campaign || undefined,
    businessProject: project?._id,
    business: project?.business,
    assignedTo: assignee,
    assignedAt: assignee ? new Date() : undefined,
    assignmentSource: assignee ? "MANUAL" : undefined,
    deliveryStatus: "RELEASED",
    tags: input.tags,
    notes: input.notes || undefined,
    duplicateOf: duplicate?._id,
    createdBy: req.user.id,
    score: 40,
  });

  await logActivity({
    lead: lead.id,
    actor: req.user.id,
    type: "LEAD_CREATED",
    title: "Lead added manually",
    description: `${input.source.replace(/_/g, " ").toLowerCase()} lead${project ? ` · ${project.name}` : ""}${duplicate ? " · possible duplicate" : ""}`,
  });
  if (input.notes) {
    await Note.create({ lead: lead._id, author: req.user.id, body: input.notes });
  }
  void refreshLeadScore(lead.id);
  emitLeadEvent(req.app.get("io"), "new_lead", { lead: lead.toObject() }, { assignedTo: assignee, business: project?.business });
  return { lead, duplicate };
}

/**
 * POST /api/leads
 * Create a lead manually. Kept for admin tooling only — leads normally arrive
 * from Meta / LeadSync, and the manual "add lead" UI was removed.
 */
r.post("/", auth, roles("ADMIN", "MANAGER"), validateBody(leadInputSchema), async (req, res) => {
  if (!req.body.phone && !req.body.email) {
    return res.status(400).json({ message: "Add at least a phone number or an email" });
  }
  try {
    const { lead, duplicate } = await createLeadFromInput(req, req.body);
    res.status(201).json({ lead, duplicate });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ message: error.message || "Could not create lead" });
  }
});

const importSchema = z.object({
  businessProject: z.union([objectId, z.literal("")]).optional().default(""),
  skipDuplicates: z.boolean().default(true),
  rows: z
    .array(
      z.object({
        name: z.string().trim().max(120).optional().default(""),
        phone: z.string().trim().max(30).optional().default(""),
        email: z.string().trim().max(160).optional().default(""),
        campaign: z.string().trim().max(120).optional().default(""),
        notes: z.string().trim().max(2000).optional().default(""),
      }),
    )
    .min(1)
    .max(1000),
});

/**
 * POST /api/leads/import
 * Bulk create leads from parsed CSV rows (max 1000 per request).
 */
r.post("/import", auth, roles("ADMIN", "MANAGER", "BUSINESS"), validateBody(importSchema), async (req, res) => {
  const body = req.body as z.infer<typeof importSchema>;
  const result = { created: 0, duplicates: 0, failed: 0, errors: [] as { row: number; message: string }[] };

  for (let i = 0; i < body.rows.length; i++) {
    const row = body.rows[i];
    const parsed = leadInputSchema.safeParse({
      name: row.name || row.phone || row.email,
      phone: row.phone,
      email: row.email && /\S+@\S+\.\S+/.test(row.email) ? row.email : "",
      campaign: row.campaign,
      notes: row.notes,
      businessProject: body.businessProject,
      source: "IMPORT",
    });
    if (!parsed.success || (!row.phone && !row.email)) {
      result.failed++;
      if (result.errors.length < 50) {
        result.errors.push({
          row: i + 2,
          message: parsed.success ? "Missing phone and email" : parsed.error.issues[0]?.message || "Invalid row",
        });
      }
      continue;
    }
    try {
      const out = await createLeadFromInput(req, parsed.data, { skipDuplicates: body.skipDuplicates });
      if (!out.lead) result.duplicates++;
      else result.created++;
    } catch (error: any) {
      result.failed++;
      if (result.errors.length < 50) result.errors.push({ row: i + 2, message: error.message });
    }
  }

  res.json(result);
});

const leadEditSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.union([z.string().trim().toLowerCase().email(), z.literal("")]).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
  dealValue: z.number().min(0).nullable().optional(),
  whatsappOptOut: z.boolean().optional(),
  interestedProduct: z.string().trim().max(60).nullable().optional(),
});

/**
 * PATCH /api/leads/:id
 * Edit lead contact details, tags, deal value and WhatsApp opt-out.
 */
r.patch("/:id", auth, validateBody(leadEditSchema), async (req, res) => {
  if (!(await canAccessLead(req, String(req.params.id)))) {
    return res.status(403).json({ message: "You do not have access to this lead" });
  }
  const body = req.body as z.infer<typeof leadEditSchema>;
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ message: "Lead not found" });

  if (body.name !== undefined) lead.name = body.name;
  if (body.phone !== undefined) lead.phone = body.phone ? normalizePhone(body.phone) || body.phone : undefined;
  if (body.email !== undefined) lead.email = body.email || undefined;
  if (body.tags !== undefined) lead.tags = Array.from(new Set(body.tags));
  if (body.dealValue !== undefined) lead.dealValue = body.dealValue ?? undefined;
  if (body.whatsappOptOut !== undefined) lead.whatsappOptOut = body.whatsappOptOut;
  if (body.interestedProduct !== undefined) lead.interestedProduct = body.interestedProduct ?? undefined;
  await lead.save();

  await logActivity({ lead: lead.id, actor: req.user!.id, type: "LEAD_UPDATED", title: "Lead details updated" });
  emitLeadEvent(req.app.get("io"), "lead_updated", { lead: lead.toObject(), reason: "EDITED" }, await leadScope(lead._id));
  res.json({ lead });
});

const bulkSchema = z.object({
  ids: z.array(objectId).min(1).max(200),
  action: z.enum(["status", "assign", "tag"]),
  status: z.string().optional(),
  lostReason: z.string().trim().max(300).optional(),
  userId: objectId.optional(),
  tag: z.string().trim().min(1).max(40).optional(),
});

/**
 * POST /api/leads/bulk
 * Bulk status change / assignment / tagging for up to 200 leads in the caller's scope.
 */
r.post("/bulk", auth, validateBody(bulkSchema), async (req, res) => {
  const body = req.body as z.infer<typeof bulkSchema>;
  const scope: any = await visibleLeadFilter(req);
  const leads = await Lead.find({ ...scope, _id: { $in: body.ids } }).select("_id name businessProject assignedTo status lostReason");
  if (!leads.length) return res.status(404).json({ message: "No accessible leads selected" });

  let updated = 0;
  const io = req.app.get("io");

  if (body.action === "status") {
    if (!body.status || !VALID_STATUSES.includes(body.status)) return res.status(400).json({ message: "Invalid status" });
    if ((body.status === "LOST" || body.status === "NOT_INTERESTED") && !body.lostReason) {
      return res.status(400).json({ message: "A reason is required for lost / not interested" });
    }
    for (const lead of leads) {
      const prev = lead.status;
      lead.status = body.status as any;
      if (body.lostReason) lead.lostReason = body.lostReason;
      await lead.save();
      await logActivity({
        lead: lead.id,
        actor: req.user!.id,
        type: "STATUS_CHANGED",
        title: "Lead status changed (bulk)",
        description: `${prev} → ${lead.status}`,
      });
      void refreshLeadScore(lead.id);
      updated++;
    }
  } else if (body.action === "assign") {
    if (!["ADMIN", "MANAGER", "BUSINESS"].includes(req.user!.role)) return res.status(403).json({ message: "Forbidden" });
    const user = await User.findOne({ _id: body.userId, role: "SALES", isActive: true }).select("_id name");
    if (!user) return res.status(404).json({ message: "Active salesperson not found" });
    for (const lead of leads) {
      if (!(await salesBelongsToProject(user.id, lead.businessProject))) continue;
      lead.assignedTo = user._id as any;
      lead.assignedAt = new Date();
      lead.assignmentSource = "MANUAL";
      await lead.save();
      await logActivity({
        lead: lead.id,
        actor: req.user!.id,
        type: "LEAD_REASSIGNED",
        title: "Lead reassigned (bulk)",
        description: `Assigned to ${user.name}.`,
      });
      updated++;
    }
    if (updated) {
      await Notification.create({
        user: user._id,
        type: "LEAD_ASSIGNED",
        title: "Leads assigned to you",
        message: `${updated} lead${updated === 1 ? " was" : "s were"} assigned to you.`,
        entityType: "User",
        entityId: user.id,
      });
      io?.to(`user:${user.id}`).emit("leads_assigned", { count: updated });
    }
  } else if (body.action === "tag") {
    if (!body.tag) return res.status(400).json({ message: "Tag is required" });
    const result = await Lead.updateMany({ _id: { $in: leads.map((l) => l._id) } }, { $addToSet: { tags: body.tag } });
    updated = result.modifiedCount;
  }

  io?.to("role:ADMIN").emit("lead_updated", { reason: "BULK", count: updated });
  res.json({ updated, skipped: leads.length - updated });
});

const noteSchema = z.object({
  body: z.string().trim().min(1, "Note cannot be empty").max(4000),
  mentions: z.array(objectId).max(10).optional().default([]),
});

/**
 * POST /api/leads/:id/notes
 * Add a free-text note; @mentioned teammates (who can see the lead) are notified.
 */
r.post("/:id/notes", auth, validateBody(noteSchema), async (req, res) => {
  if (!(await canAccessLead(req, String(req.params.id)))) {
    return res.status(403).json({ message: "You do not have access to this lead" });
  }
  const body = req.body as z.infer<typeof noteSchema>;
  const lead = await Lead.findById(req.params.id).select("_id name assignedTo business businessProject");
  if (!lead) return res.status(404).json({ message: "Lead not found" });

  // Only people who can see the lead can be mentioned.
  const scope = await leadScope(lead._id);
  const mentionable = await User.find({ _id: { $in: body.mentions }, isActive: true })
    .select("_id role business")
    .lean();
  const validMentions = mentionable
    .filter(
      (u: any) =>
        u.role === "ADMIN" ||
        u.role === "MANAGER" ||
        String(u._id) === String(lead.assignedTo) ||
        (scope.business && String(u.business) === String(scope.business)),
    )
    .map((u: any) => u._id);

  const note = await Note.create({ lead: lead._id, author: req.user!.id, body: body.body, mentions: validMentions });
  await logActivity({
    lead: lead.id,
    actor: req.user!.id,
    type: "NOTE_ADDED",
    title: "Note added",
    description: body.body.slice(0, 140),
  });

  const recipients = validMentions.filter((id: any) => String(id) !== req.user!.id);
  if (recipients.length) {
    await Notification.insertMany(
      recipients.map((id: any) => ({
        user: id,
        type: "MENTION",
        title: `${req.user!.name} mentioned you`,
        message: `${lead.name}: ${body.body.slice(0, 160)}`,
        entityType: "Lead",
        entityId: lead.id,
      })),
    );
    const io = req.app.get("io");
    for (const id of recipients) io?.to(`user:${String(id)}`).emit("notification", { type: "MENTION", leadId: lead.id });
  }

  const populated = await Note.findById(note._id)
    .populate("author", "name role profilePhotoUrl")
    .populate("mentions", "name role")
    .lean();
  res.status(201).json({ note: populated });
});

r.patch("/:id/notes/:noteId", auth, validateBody(z.object({ pinned: z.boolean() })), async (req, res) => {
  if (!(await canAccessLead(req, String(req.params.id)))) {
    return res.status(403).json({ message: "You do not have access to this lead" });
  }
  const note = await Note.findOneAndUpdate(
    { _id: req.params.noteId, lead: req.params.id },
    { $set: { pinned: req.body.pinned } },
    { new: true },
  );
  if (!note) return res.status(404).json({ message: "Note not found" });
  res.json({ note });
});

r.delete("/:id/notes/:noteId", auth, async (req, res) => {
  if (!(await canAccessLead(req, String(req.params.id)))) {
    return res.status(403).json({ message: "You do not have access to this lead" });
  }
  const note = await Note.findOne({ _id: req.params.noteId, lead: req.params.id });
  if (!note) return res.status(404).json({ message: "Note not found" });
  const isAdmin = req.user!.role === "ADMIN" || req.user!.role === "MANAGER";
  if (!isAdmin && String(note.author) !== req.user!.id) {
    return res.status(403).json({ message: "You can only delete your own notes" });
  }
  await note.deleteOne();
  res.json({ success: true });
});

/**
 * POST /api/leads/remap
 * Admin manually triggers remapping of all unmapped leads to matching business projects.
 */
r.post("/remap", auth, roles("ADMIN"), async (_req, res) => {
  const result = await remapUnmappedLeads();
  res.json({
    success: true,
    remappedCount: result.remappedCount,
    scannedCount: result.scannedCount,
    message: `Successfully remapped ${result.remappedCount} of ${result.scannedCount} unmapped leads.`,
  });
});

export default r;
