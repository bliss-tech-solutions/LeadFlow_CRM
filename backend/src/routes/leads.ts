import { Router } from "express";
import ExcelJS from "exceljs";
import { Lead } from "../models/Lead";
import { Activity } from "../models/Activity";
import { Call } from "../models/Call";
import { FollowUp } from "../models/FollowUp";
import { User } from "../models/User";
import { BusinessProject } from "../models/BusinessProject";
import { auth, roles } from "../middleware/auth";
import { logActivity, logAudit } from "../utils/activity";
import { Notification } from "../models/Notification";
import { remapUnmappedLeads } from "../services/leadRemap.service";

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

/**
 * Build the lead visibility filter:
 * - ADMIN / MANAGER sees all released leads.
 * - BUSINESS sees all released leads for their assigned project.
 * - SALES sees only their assigned leads.
 */
async function visibleLeadFilter(req: any) {
  const filter: Record<string, unknown> = {
    deliveryStatus: { $ne: "HELD" },
  };

  const { business, businessProject } = req.query as Record<string, string>;

  if (req.user?.role === "ADMIN" || req.user?.role === "MANAGER") {
    if (business) {
      const bizProjects = await BusinessProject.find({ business }).select("_id").lean();
      filter.businessProject = { $in: bizProjects.map((p: any) => p._id) };
    } else if (businessProject) {
      filter.businessProject = businessProject;
    }
    return filter;
  }

  if (req.user?.role === "BUSINESS") {
    let businessId = req.user.business;
    if (!businessId) {
      const me = await User.findById(req.user.id).select("business businessProject").lean();
      businessId = me?.business ? String(me.business) : undefined;
    }
    const projectIds: any[] = [];
    if (businessId) {
      const bizProjects = await BusinessProject.find({ business: businessId }).select("_id").lean();
      projectIds.push(...bizProjects.map((p: any) => p._id));
    }
    if (req.user.businessProject) {
      projectIds.push(req.user.businessProject);
    }
    if (!projectIds.length) {
      filter.businessProject = { $in: [] };
      return filter;
    }

    if (businessProject && projectIds.map(String).includes(String(businessProject))) {
      filter.businessProject = businessProject;
    } else {
      filter.businessProject = { $in: projectIds };
    }
    return filter;
  }

  // SALES role
  filter.assignedTo = req.user!.id;
  filter.deliveryStatus = "RELEASED";

  let assignedProjects = req.user.assignedProjects;
  if (!assignedProjects) {
    const me = await User.findById(req.user.id).select("assignedProjects").lean();
    assignedProjects = me?.assignedProjects?.map(String) || [];
  }

  if (assignedProjects && assignedProjects.length > 0) {
    if (businessProject && assignedProjects.map(String).includes(String(businessProject))) {
      filter.businessProject = businessProject;
    } else {
      filter.businessProject = { $in: assignedProjects };
    }
  } else if (businessProject) {
    filter.businessProject = businessProject;
  }

  return filter;
}

async function canAccessLead(req: any, leadId: string) {
  if (req.user?.role === "ADMIN" || req.user?.role === "MANAGER") return true;

  if (req.user?.role === "BUSINESS") {
    let businessId = req.user.business;
    if (!businessId) {
      const u = await User.findById(req.user.id).select("business businessProject").lean();
      businessId = u?.business ? String(u.business) : undefined;
    }
    const projectIds: any[] = [];
    if (businessId) {
      const bizProjects = await BusinessProject.find({ business: businessId }).select("_id").lean();
      projectIds.push(...bizProjects.map((p: any) => p._id));
    }
    if (req.user.businessProject) {
      projectIds.push(req.user.businessProject);
    }
    if (!projectIds.length) return false;
    return Boolean(
      await Lead.exists({
        _id: leadId,
        businessProject: { $in: projectIds },
        deliveryStatus: { $ne: "HELD" },
      }),
    );
  }

  const salesLead: any = await Lead.findOne({
    _id: leadId,
    assignedTo: req.user!.id,
    deliveryStatus: "RELEASED",
  }).select("businessProject").lean();

  if (!salesLead) return false;

  let assignedProjects = req.user.assignedProjects;
  if (!assignedProjects) {
    const me = await User.findById(req.user.id).select("assignedProjects").lean();
    assignedProjects = me?.assignedProjects?.map(String) || [];
  }

  if (assignedProjects && assignedProjects.length > 0 && salesLead.businessProject) {
    return assignedProjects.map(String).includes(String(salesLead.businessProject));
  }

  return true;
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
 * GET /api/leads
 * List only the leads the authenticated user is allowed to see.
 */
r.get("/", auth, async (req, res) => {
  const {
    search,
    status,
    source,
    assignedTo,
    businessProject,
    page = "1",
    limit = "20",
  } = req.query as Record<string, string>;

  const q: any = await visibleLeadFilter(req);

  if (status) q.status = status;
  if (source) q.source = source;

  // ADMIN may filter by any salesperson. Other roles cannot override their own scope.
  if (assignedTo && req.user?.role === "ADMIN") {
    q.assignedTo = assignedTo;
  }



  if (search) {
    q.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { source: { $regex: search, $options: "i" } },
      { campaign: { $regex: search, $options: "i" } },
      { formName: { $regex: search, $options: "i" } },
      { "meta.businessId": { $regex: search, $options: "i" } },
      { "meta.pageId": { $regex: search, $options: "i" } },
      { "meta.pageName": { $regex: search, $options: "i" } },
      { "meta.fieldData.name": { $regex: search, $options: "i" } },
      { "meta.fieldData.values": { $regex: search, $options: "i" } },
    ];
  }

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));

  const [leads, total] = await Promise.all([
    Lead.find(q)
      .populate("assignedTo", "name email")
      .populate({
        path: "businessProject",
        select: "name stage documents products business",
        populate: { path: "business", select: "name contactNo email status" },
      })
      .sort({ createdAt: -1 })
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
  const {
    search,
    status,
    source,
    assignedTo,
    businessProject,
  } = req.query as Record<string, string>;

  const q: any = await visibleLeadFilter(req);

  if (status) q.status = status;
  if (source) q.source = source;

  if (assignedTo && req.user?.role === "ADMIN") {
    q.assignedTo = assignedTo;
  }



  if (search) {
    q.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { source: { $regex: search, $options: "i" } },
      { campaign: { $regex: search, $options: "i" } },
      { formName: { $regex: search, $options: "i" } },
      { "meta.businessId": { $regex: search, $options: "i" } },
      { "meta.pageId": { $regex: search, $options: "i" } },
      { "meta.pageName": { $regex: search, $options: "i" } },
      { "meta.fieldData.name": { $regex: search, $options: "i" } },
      { "meta.fieldData.values": { $regex: search, $options: "i" } },
    ];
  }

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

  const [activities, calls, followups] = await Promise.all([
    Activity.find({ lead: lead._id })
      .populate("actor", "name")
      .sort({ createdAt: -1 }),
    Call.find({ lead: lead._id })
      .populate("user", "name")
      .sort({ createdAt: -1 }),
    FollowUp.find({ lead: lead._id })
      .populate("user", "name")
      .sort({ createdAt: -1, updatedAt: -1 }),
  ]);

  res.json({ lead, activities, calls, followups });
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
  await lead.save();

  await logActivity({
    lead: lead.id,
    actor: req.user!.id,
    type: "STATUS_CHANGED",
    title: "Lead status changed",
    description: `${before.status} → ${lead.status}`,
  });

  await logAudit({
    actor: req.user!.id,
    action: "STATUS_CHANGED",
    entity: "Lead",
    entityId: lead.id,
    before,
    after: {
      status: lead.status,
      contactStatus: lead.contactStatus,
    },
    ip: req.ip,
  });

  res.json({ lead });
});

/**
 * PATCH /api/leads/:id/assign
 * Admin manually assigns a released lead to a salesperson, bypassing automatic daily capacity.
 */
r.patch("/:id/assign", auth, roles("ADMIN"), async (req, res) => {
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

  await logAudit({
    actor: req.user!.id,
    action: "LEAD_REASSIGNED",
    entity: "Lead",
    entityId: lead.id,
    before: { assignedTo: before },
    after: { assignedTo: user._id, assignmentSource: "MANUAL" },
    ip: req.ip,
  });

  const io = req.app.get("io");

  // Assignment is an internal state change, not a user notification.
  // The lead notification is the only lead popup shown to users.
  if (io) {
    io.to("role:ADMIN").emit("lead_updated", { lead: lead.toObject(), reason: "ASSIGNED" });
    io.to(`user:${user.id}`).emit("lead_updated", { lead: lead.toObject(), reason: "ASSIGNED" });
  }

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

  const call = await Call.create({
    lead: req.params.id,
    user: req.user!.id,
    result: req.body.result,
    durationSec: req.body.durationSec,
    notes: req.body.notes,
    startedAt: req.body.startedAt ?? new Date(),
    endedAt: req.body.endedAt ?? new Date(),
  });

  const status = req.body.result === "NOT_PICKED" ? "FOLLOW_UP" : "CONTACTED";

  await Lead.findByIdAndUpdate(req.params.id, {
    status,
    lastContactAt: new Date(),
  });

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
    io.to("role:ADMIN").emit("call_logged", payload);
    io.to(`user:${req.user!.id}`).emit("call_logged", payload);
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

  if (io && populatedFollowup) {
    const payload = {
      followUp: populatedFollowup,
      action: "FOLLOWUP_CREATED",
      actorId: req.user!.id,
    };

    io.to("role:ADMIN").emit("followup_updated", payload);
    io.to(`user:${assignedUser.id}`).emit("followup_updated", payload);
  }

  res.status(201).json({ followUp: populatedFollowup ?? f });
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
