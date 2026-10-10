import { Router } from "express";
import { Lead } from "../models/Lead";
import { Activity } from "../models/Activity";
import { Call } from "../models/Call";
import { FollowUp } from "../models/FollowUp";
import { User } from "../models/User";
import { auth, roles } from "../middleware/auth";
import { logActivity, logAudit } from "../utils/activity";
import { Notification } from "../models/Notification";

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
 * Build the lead visibility filter: ADMIN sees all released leads, others see only assigned leads.
 */
function visibleLeadFilter(req: any) {
  const filter: Record<string, unknown> = {
    deliveryStatus: { $ne: "HELD" },
  };

  if (req.user?.role !== "ADMIN") {
    filter.assignedTo = req.user!.id;
  }

  return filter;
}

/**
 * Check whether the current user may work with a specific lead.
 */
async function canAccessLead(req: any, leadId: string) {
  if (req.user?.role === "ADMIN") return true;

  return Boolean(
    await Lead.exists({
      _id: leadId,
      assignedTo: req.user!.id,
      deliveryStatus: "RELEASED",
    }),
  );
}

/**
 * GET /api/leads/stats
 * Return lead funnel counts scoped to the authenticated user's access.
 */
r.get("/stats", auth, async (req, res) => {
  const match = visibleLeadFilter(req);

  const [total, newCount, interested, followups, won, lost, held] =
    await Promise.all([
      Lead.countDocuments(match),
      Lead.countDocuments({ ...match, status: "NEW" }),
      Lead.countDocuments({ ...match, status: "INTERESTED" }),
      Lead.countDocuments({ ...match, status: "FOLLOW_UP" }),
      Lead.countDocuments({ ...match, status: "WON" }),
      Lead.countDocuments({ ...match, status: "LOST" }),
      req.user?.role === "ADMIN"
        ? Lead.countDocuments({ deliveryStatus: "HELD" })
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
    page = "1",
    limit = "20",
  } = req.query as Record<string, string>;

  const q: any = visibleLeadFilter(req);

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
      { "meta.fieldData.name": { $regex: search, $options: "i" } },
      { "meta.fieldData.values": { $regex: search, $options: "i" } },
    ];
  }

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));

  const [leads, total] = await Promise.all([
    Lead.find(q)
      .populate("assignedTo", "name email")
      .populate("businessProject", "name stage documents products")
      .sort({ updatedAt: -1 })
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
 * GET /api/leads/followups/all
 * Return pending follow-ups scoped to the authenticated user's assigned work.
 */
r.get("/followups/all", auth, async (req, res) => {
  const query: Record<string, unknown> =
    req.user?.role === "ADMIN"
      ? { status: "PENDING" }
      : { user: req.user!.id, status: "PENDING" };

  res.json({
    followups: await FollowUp.find(query)
      .populate("lead", "name email phone status")
      .populate("user", "name email")
      .sort({ scheduledAt: 1 }),
  });
});

/**
 * GET /api/leads/:id
 * Return one accessible lead plus activity, calls, follow-ups and project documents.
 */
r.get("/:id", auth, async (req, res) => {
  if (!(await canAccessLead(req, String(req.params.id)))) {
    return res
      .status(403)
      .json({ message: "You do not have access to this lead" });
  }

  const lead = await Lead.findById(req.params.id)
    .populate("assignedTo", "name email")
    .populate(
      "businessProject",
      "name stage developerGroup reraNumber penthouse products upcoming completed ongoing metaSources documents",
    );

  if (!lead) {
    return res.status(404).json({ message: "Lead not found" });
  }

  const [activities, calls, followups] = await Promise.all([
    Activity.find({ lead: lead._id })
      .populate("actor", "name role")
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

  // Admins may explicitly choose a follow-up owner. If they do not,
  // the follow-up must follow the lead's existing salesperson assignment
  // instead of silently becoming an Admin-owned follow-up.
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
      : req.user!.id;

  const assignedUser = await User.findOne({
    _id: followupUserId,
    isActive: true,
    role: { $in: ["ADMIN", "MANAGER", "SALES"] },
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

  // The assigned salesperson/owner and all workspace managers/admins are
  // notified. The recipient query is de-duplicated by MongoDB's $or match,
  // so an Admin who owns a follow-up does not receive duplicate DB records.
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

    // Admin/manager workspace notification.
    io.to("role:ADMIN").emit("followup_updated", payload);

    // The actual owner receives the same event even when an Admin created it.
    io.to(`user:${assignedUser.id}`).emit("followup_updated", payload);
  }

  res.status(201).json({ followUp: populatedFollowup ?? f });
});

export default r;
