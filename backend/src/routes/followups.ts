import { Router } from "express";
import ExcelJS from "exceljs";
import { FollowUp } from "../models/FollowUp";
import { Lead } from "../models/Lead";
import { User } from "../models/User";
import { BusinessProject } from "../models/BusinessProject";
import { auth } from "../middleware/auth";
import { logActivity } from "../utils/activity";
import { leadAudience, notifyUsers } from "../utils/notify";
import { containsRegex } from "../utils/regex";

const r = Router();

async function visibleFollowupFilter(req: any) {
  const { business, businessProject } = req.query as Record<string, string>;

  if (req.user?.role === "ADMIN" || req.user?.role === "MANAGER") {
    const q: Record<string, unknown> = {};
    if (business) {
      const bizProjects = await BusinessProject.find({ business }).select("_id").lean();
      const leadIds = await Lead.distinct("_id", {
        businessProject: { $in: bizProjects.map((p: any) => p._id) },
      });
      q.lead = { $in: leadIds };
    } else if (businessProject) {
      const leadIds = await Lead.distinct("_id", {
        businessProject,
      });
      q.lead = { $in: leadIds };
    }
    return q;
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
    if (!projectIds.length) return { _id: null };

    let targetProjects = projectIds;
    if (businessProject && projectIds.map(String).includes(String(businessProject))) {
      targetProjects = [businessProject as any];
    }

    const leadIds = await Lead.distinct("_id", {
      businessProject: { $in: targetProjects },
    });
    return { lead: { $in: leadIds } };
  }

  // SALES role
  let assignedProjects = req.user.assignedProjects;
  if (!assignedProjects) {
    const me = await User.findById(req.user.id).select("assignedProjects").lean();
    assignedProjects = me?.assignedProjects?.map(String) || [];
  }

  const leadFilter: Record<string, unknown> = { assignedTo: req.user!.id };
  if (assignedProjects && assignedProjects.length > 0) {
    if (businessProject && assignedProjects.map(String).includes(String(businessProject))) {
      leadFilter.businessProject = businessProject;
    } else {
      leadFilter.businessProject = { $in: assignedProjects };
    }
  } else if (businessProject) {
    leadFilter.businessProject = businessProject;
  }

  const leadIds = await Lead.distinct("_id", leadFilter);
  return { user: req.user!.id, lead: { $in: leadIds } };
}

async function syncLeadNextFollowup(leadId: string) {
  const next = await FollowUp.findOne({
    lead: leadId,
    status: "PENDING",
    scheduledAt: { $gt: new Date() },
  })
    .sort({ scheduledAt: 1 })
    .select("scheduledAt")
    .lean();

  await Lead.findByIdAndUpdate(leadId, {
    nextFollowUpAt: next?.scheduledAt ?? null,
  });
}

async function notifyFollowup(
  req: any,
  followup: any,
  action: string,
  message: string,
) {
  const ownerId = String(followup.user?._id ?? followup.user);
  const leadId = String(followup.lead?._id ?? followup.lead);
  const titles: Record<string, string> = {
    FOLLOWUP_COMPLETED: "Follow-up completed",
    FOLLOWUP_CANCELLED: "Follow-up cancelled",
    FOLLOWUP_RESCHEDULED: "Follow-up rescheduled",
    FOLLOWUP_CREATED: "Follow-up scheduled",
    FOLLOWUP_REMINDER: "Follow-up reminder",
  };
  const actorName = req.user?.name ? ` by ${req.user.name}` : "";

  // Owner, assigned salesperson, business owner and admins — everyone but the actor.
  const audience = await leadAudience(leadId, { include: [ownerId], exclude: [req.user?.id] });
  await notifyUsers(audience, {
    type: action,
    title: titles[action] || "Follow-up updated",
    message: `${message}${actorName}`,
    entityType: "Lead",
    entityId: leadId,
  });

  // Data refresh for every open screen of the same people (and the actor's other devices).
  const io = req.app.get("io");
  if (io) {
    const payload = {
      followUp: followup.toObject ? followup.toObject() : followup,
      action,
      actorId: req.user!.id,
    };
    for (const id of new Set([...audience, String(req.user!.id)])) io.to(`user:${id}`).emit("followup_updated", payload);
  }
}

r.get("/calendar", auth, async (req, res) => {
  const query = req.query as Record<string, string>;
  const from = query.start || query.from || "";
  const to = query.end || query.to || "";
  const start = new Date(from);
  const end = new Date(to);
  if (
    !from ||
    !to ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start >= end
  ) {
    return res
      .status(400)
      .json({ message: "Valid start and end dates are required." });
  }

  const filter: any = {
    ...(await visibleFollowupFilter(req)),
    scheduledAt: { $gte: start, $lt: end },
  };
  if (query.businessProject && req.user?.role !== "BUSINESS") {
    const leadIds = await Lead.distinct("_id", {
      businessProject: query.businessProject,
    });
    const existingLeadIds = filter.lead?.$in as any[] | undefined;
    filter.lead = {
      $in: existingLeadIds
        ? leadIds.filter((id: any) =>
            existingLeadIds.some(
              (existing: any) => String(existing) === String(id),
            ),
          )
        : leadIds,
    };
  }
  const followups = await FollowUp.find(filter)
    .populate({
      path: "lead",
      select: "name email phone status businessProject",
      populate: { path: "businessProject", select: "name stage location business", populate: { path: "business", select: "name contactNo" } },
    })
    .populate("user", "name email")
    .sort({ scheduledAt: 1 })
    .limit(2000)
    .lean();
  const events = followups.map((item: any) => ({
    ...item,
    eventType: String(item.type || "FOLLOW_UP")
      .toUpperCase()
      .includes("CALL")
      ? "CALL"
      : "FOLLOW_UP",
  }));
  res.json({ events, followups: events });
});

r.get("/stats", auth, async (req, res) => {
  const base: any = await visibleFollowupFilter(req);
  const { businessProject } = req.query as Record<string, string>;
  if (businessProject && req.user?.role !== "BUSINESS") {
    const leadIds = await Lead.distinct("_id", {
      businessProject,
    });
    const existingLeadIds = base.lead?.$in as any[] | undefined;
    base.lead = {
      $in: existingLeadIds
        ? leadIds.filter((id: any) =>
            existingLeadIds.some(
              (existing: any) => String(existing) === String(id),
            ),
          )
        : leadIds,
    };
  }
  const now = new Date();

  const [pending, completed, missed, cancelled, rescheduled, overdue] =
    await Promise.all([
      FollowUp.countDocuments({ ...base, status: "PENDING" }),
      FollowUp.countDocuments({ ...base, status: "COMPLETED" }),
      FollowUp.countDocuments({ ...base, status: "MISSED" }),
      FollowUp.countDocuments({ ...base, status: "CANCELLED" }),
      FollowUp.countDocuments({ ...base, status: "RESCHEDULED" }),
      FollowUp.countDocuments({
        ...base,
        status: "PENDING",
        scheduledAt: { $lt: now },
      }),
    ]);

  res.json({ pending, completed, missed, cancelled, rescheduled, overdue });
});

r.get("/", auth, async (req, res) => {
  const {
    search = "",
    status = "",
    businessProject = "",
    page = "1",
    limit = "10",
  } = req.query as Record<string, string>;

  const filter: any = await visibleFollowupFilter(req);
  if (status) filter.status = status;

  const normalizedSearch = String(search).trim();
  if (normalizedSearch || (businessProject && req.user?.role !== "BUSINESS")) {
    const leadQuery: any = {};
    if (businessProject && req.user?.role !== "BUSINESS") {
      leadQuery.businessProject = businessProject;
    }
    if (normalizedSearch) {
      leadQuery.$or = [
        { name: containsRegex(normalizedSearch) },
        { email: containsRegex(normalizedSearch) },
        { phone: containsRegex(normalizedSearch) },
      ];
    }

    const matchingLeads = await Lead.find(leadQuery).select("_id").lean();
    const matchingLeadIds = matchingLeads.map((item) => item._id);
    const existingLeadIds = filter.lead?.$in as any[] | undefined;
    filter.lead = {
      $in: existingLeadIds
        ? matchingLeadIds.filter((id: any) =>
            existingLeadIds.some(
              (existing: any) => String(existing) === String(id),
            ),
          )
        : matchingLeadIds,
    };
  }

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(50, Math.max(1, Number(limit) || 10));

  const [followups, total] = await Promise.all([
    FollowUp.find(filter)
      .populate({
        path: "lead",
        select: "name email phone status businessProject",
        populate: { path: "businessProject", select: "name stage location business", populate: { path: "business", select: "name contactNo" } },
      })
      .populate("user", "name email")
      .sort({ createdAt: -1, updatedAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    FollowUp.countDocuments(filter),
  ]);

  res.json({ followups, total, page: p, pages: Math.ceil(total / l) });
});

/**
 * GET /api/followups/export
 * Download an Excel file of follow-ups using exceljs, scoped to user permissions and active filters.
 */
r.get("/export", auth, async (req, res) => {
  const {
    search = "",
    status = "",
    businessProject = "",
  } = req.query as Record<string, string>;

  const filter: any = await visibleFollowupFilter(req);
  if (status) filter.status = status;

  const normalizedSearch = String(search).trim();
  if (normalizedSearch || (businessProject && req.user?.role !== "BUSINESS")) {
    const leadQuery: any = {};
    if (businessProject && req.user?.role !== "BUSINESS") {
      leadQuery.businessProject = businessProject;
    }
    if (normalizedSearch) {
      leadQuery.$or = [
        { name: containsRegex(normalizedSearch) },
        { email: containsRegex(normalizedSearch) },
        { phone: containsRegex(normalizedSearch) },
      ];
    }

    const matchingLeads = await Lead.find(leadQuery).select("_id").lean();
    const matchingLeadIds = matchingLeads.map((item) => item._id);
    const existingLeadIds = filter.lead?.$in as any[] | undefined;
    filter.lead = {
      $in: existingLeadIds
        ? matchingLeadIds.filter((id: any) =>
            existingLeadIds.some(
              (existing: any) => String(existing) === String(id),
            ),
          )
        : matchingLeadIds,
    };
  }

  const followups = await FollowUp.find(filter)
    .populate({
      path: "lead",
      select: "name email phone status businessProject",
      populate: { path: "businessProject", select: "name stage location business", populate: { path: "business", select: "name contactNo" } },
    })
    .populate("user", "name email")
    .sort({ scheduledAt: -1 })
    .limit(5000)
    .lean();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LeadFlow CRM";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Follow-ups");

  worksheet.columns = [
    { header: "Lead Name", key: "leadName", width: 24 },
    { header: "Phone", key: "phone", width: 18 },
    { header: "Email", key: "email", width: 28 },
    { header: "Business / Project", key: "business", width: 24 },
    { header: "Owner", key: "owner", width: 20 },
    { header: "Type", key: "type", width: 14 },
    { header: "Scheduled Date & Time", key: "scheduledAt", width: 24 },
    { header: "Status", key: "status", width: 16 },
    { header: "Lead Status", key: "leadStatus", width: 16 },
    { header: "Outcome / Reason / Notes", key: "notes", width: 36 },
    { header: "Created At", key: "createdAt", width: 22 },
    { header: "Completed At", key: "completedAt", width: 22 },
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

  for (const f of followups as any[]) {
    const lead = f.lead;
    const user = f.user;
    const row = worksheet.addRow({
      leadName: lead?.name || "Lead unavailable",
      phone: lead?.phone || "",
      email: lead?.email || "",
      business: lead?.businessProject?.name || "Unmapped",
      owner: user?.name || "Unassigned",
      type: f.type || "CALL",
      scheduledAt: f.scheduledAt
        ? new Date(f.scheduledAt).toLocaleString()
        : "",
      status: f.status || "",
      leadStatus: lead?.status || "",
      notes: f.outcomeNote || f.cancellationReason || f.notes || "",
      createdAt: f.createdAt ? new Date(f.createdAt).toLocaleString() : "",
      completedAt: f.completedAt ? new Date(f.completedAt).toLocaleString() : "",
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
    `attachment; filename="followups-${dateStr}.xlsx"`,
  );

  await workbook.xlsx.write(res);
  res.end();
});

async function getAccessibleFollowup(req: any, id: string) {
  const filter = await visibleFollowupFilter(req);
  return FollowUp.findOne({
    _id: id,
    ...filter,
  }).populate("lead", "name phone email status");
}

r.patch("/:id/complete", auth, async (req, res) => {
  const followup = await getAccessibleFollowup(req, String(req.params.id));
  if (!followup)
    return res.status(404).json({ message: "Follow-up not found" });
  if (followup.status !== "PENDING") {
    return res
      .status(409)
      .json({ message: "Only pending follow-ups can be completed" });
  }

  const note = String(req.body?.completionNote ?? "").trim();
  followup.status = "COMPLETED";
  followup.completedAt = new Date();
  followup.outcomeNote = note || undefined;
  await followup.save();

  const leadId = String((followup.lead as any)?._id ?? followup.lead);
  await syncLeadNextFollowup(leadId);

  await logActivity({
    lead: leadId,
    actor: req.user!.id,
    type: "FOLLOWUP_COMPLETED",
    title: "Follow-up completed",
    description: note || "Scheduled follow-up marked completed.",
    metadata: { followUpId: followup.id },
  });

  await notifyFollowup(
    req,
    followup,
    "FOLLOWUP_COMPLETED",
    `${(followup.lead as any)?.name || "Lead"} follow-up was completed.`,
  );

  res.json({ followUp: followup });
});

r.patch("/:id/cancel", auth, async (req, res) => {
  const followup = await getAccessibleFollowup(req, String(req.params.id));
  if (!followup)
    return res.status(404).json({ message: "Follow-up not found" });
  if (followup.status !== "PENDING") {
    return res
      .status(409)
      .json({ message: "Only pending follow-ups can be cancelled" });
  }

  const reason = String(req.body?.reason ?? "").trim();
  followup.status = "CANCELLED";
  followup.cancelledAt = new Date();
  followup.cancellationReason = reason || "Cancelled without a reason.";
  await followup.save();

  const leadId = String((followup.lead as any)?._id ?? followup.lead);
  await syncLeadNextFollowup(leadId);

  await logActivity({
    lead: leadId,
    actor: req.user!.id,
    type: "FOLLOWUP_CANCELLED",
    title: "Follow-up cancelled",
    description: followup.cancellationReason,
    metadata: { followUpId: followup.id },
  });

  await notifyFollowup(
    req,
    followup,
    "FOLLOWUP_CANCELLED",
    `${(followup.lead as any)?.name || "Lead"} follow-up was cancelled.`,
  );

  res.json({ followUp: followup });
});

r.patch("/:id/reschedule", auth, async (req, res) => {
  const oldFollowup = await getAccessibleFollowup(req, String(req.params.id));
  if (!oldFollowup)
    return res.status(404).json({ message: "Follow-up not found" });
  if (oldFollowup.status !== "PENDING") {
    return res
      .status(409)
      .json({ message: "Only pending follow-ups can be rescheduled" });
  }

  const scheduledAt = new Date(req.body?.scheduledAt);
  if (
    Number.isNaN(scheduledAt.getTime()) ||
    scheduledAt.getTime() <= Date.now()
  ) {
    return res
      .status(400)
      .json({ message: "Choose a valid future date and time" });
  }

  const reason = String(req.body?.reason ?? "").trim();
  const newFollowup = await FollowUp.create({
    lead: oldFollowup.lead,
    user: oldFollowup.user,
    type: req.body?.type || oldFollowup.type,
    scheduledAt,
    reminderAt: new Date(scheduledAt.getTime() - 24 * 60 * 60 * 1000),
    notes: req.body?.notes ?? oldFollowup.notes,
    status: "PENDING",
    rescheduledFrom: oldFollowup._id,
  });

  oldFollowup.status = "CANCELLED";
  oldFollowup.cancelledAt = new Date();
  oldFollowup.rescheduledAt = new Date();
  oldFollowup.cancellationReason = reason
    ? `Rescheduled: ${reason}`
    : "Rescheduled to a new follow-up time.";
  await oldFollowup.save();

  const leadId = String((oldFollowup.lead as any)?._id ?? oldFollowup.lead);
  await Lead.findByIdAndUpdate(leadId, { nextFollowUpAt: scheduledAt });

  await logActivity({
    lead: leadId,
    actor: req.user!.id,
    type: "FOLLOWUP_RESCHEDULED",
    title: "Follow-up rescheduled",
    description: `${new Date(scheduledAt).toLocaleString()}${reason ? ` · ${reason}` : ""}`,
    metadata: { oldFollowUpId: oldFollowup.id, newFollowUpId: newFollowup.id },
  });

  const activeFollowup = await FollowUp.findById(newFollowup._id)
    .populate("lead", "name phone email status")
    .populate("user", "name email")
    .lean();

  await notifyFollowup(
    req,
    activeFollowup,
    "FOLLOWUP_RESCHEDULED",
    `${(oldFollowup.lead as any)?.name || "Lead"} follow-up was rescheduled to ${scheduledAt.toLocaleString()}.`,
  );

  res
    .status(201)
    .json({ followUp: activeFollowup, previousFollowUp: oldFollowup });
});

export default r;
