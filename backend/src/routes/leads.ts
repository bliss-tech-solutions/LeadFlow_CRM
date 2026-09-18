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
    ];
  }

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));

  const [leads, total] = await Promise.all([
    Lead.find(q)
      .populate("assignedTo", "name email")
      .populate("businessProject", "name stage documents products")
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
  if (!(await canAccessLead(req, req.params.id))) {
    return res.status(403).json({ message: "You do not have access to this lead" });
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
      .sort({ scheduledAt: 1 }),
  ]);

  res.json({ lead, activities, calls, followups });
});


/**
 * PATCH /api/leads/:id/status
 * Change the status of an accessible lead and write the audit trail.
 */
r.patch("/:id/status", auth, async (req, res) => {
  if (!(await canAccessLead(req, req.params.id))) {
    return res.status(403).json({ message: "You do not have access to this lead" });
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
    return res.status(404).json({ message: "Lead or active salesperson not found" });
  }

  if (lead.deliveryStatus !== "RELEASED") {
    return res.status(400).json({ message: "Held leads cannot be manually assigned until they are released" });
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

  await Notification.insertMany([
    {
      user: user._id,
      type: "LEAD_ASSIGNED",
      title: "Lead assigned to you",
      message: `${lead.name} was assigned to you by Admin.`,
      entityType: "Lead",
      entityId: lead.id,
    },
    ...(
      await User.find({ role: "ADMIN", isActive: true })
        .select("_id")
        .lean()
    ).map((admin) => ({
      user: admin._id,
      type: "LEAD_ASSIGNED",
      title: "Lead manually assigned",
      message: `${lead.name} was assigned to ${user.name}.`,
      entityType: "Lead",
      entityId: lead.id,
    })),
  ]);

  const io = req.app.get("io");

  if (io) {
    io.to(`user:${user.id}`).emit("lead_assigned", {
      lead: lead.toObject(),
    });

    io.to("role:ADMIN").emit("lead_assigned", {
      lead: lead.toObject(),
    });
  }

  res.json({ lead });
});


/**
 * POST /api/leads/:id/calls
 * Record a call only against a lead visible to the current user.
 */
r.post("/:id/calls", auth, async (req, res) => {
  if (!(await canAccessLead(req, req.params.id))) {
    return res.status(403).json({ message: "You do not have access to this lead" });
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
    type: req.body.result === "NOT_PICKED" ? "CALL_NOT_PICKED" : "CALL_COMPLETED",
    title: `Call: ${req.body.result}`,
    description: req.body.notes,
  });

  res.status(201).json({ call });
});


/**
 * POST /api/leads/:id/followups
 * Schedule a future follow-up for an accessible lead.
 */
r.post("/:id/followups", auth, async (req, res) => {
  if (!(await canAccessLead(req, req.params.id))) {
    return res.status(403).json({ message: "You do not have access to this lead" });
  }

  const scheduledAt = new Date(req.body.scheduledAt);

  if (Number.isNaN(scheduledAt.getTime())) {
    return res.status(400).json({ message: "A valid follow-up date and time are required" });
  }

  if (scheduledAt.getTime() <= Date.now()) {
    return res.status(400).json({ message: "Follow-up must be scheduled in the future" });
  }

  const followupUserId = req.user!.role === "ADMIN"
    ? req.body.userId ?? req.user!.id
    : req.user!.id;

  const assignedUser = await User.findOne({
    _id: followupUserId,
    isActive: true,
  }).select("_id name");

  if (!assignedUser) {
    return res.status(400).json({ message: "Follow-up owner is invalid" });
  }

  const f = await FollowUp.create({
    lead: req.params.id,
    user: assignedUser._id,
    type: req.body.type ?? "CALL",
    scheduledAt,
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
      { role: "ADMIN" },
      { _id: assignedUser._id },
    ],
  }).select("_id").lean();

  await Notification.insertMany(
    recipients.map((user) => ({
      user: user._id,
      type: "FOLLOWUP_CREATED",
      title: "Follow-up scheduled",
      message: `A ${f.type} follow-up is scheduled for ${new Date(f.scheduledAt).toLocaleString()}.`,
      entityType: "Lead",
      entityId: req.params.id,
    })),
  );

  const io = req.app.get("io");

  if (io) {
    io.to("role:ADMIN").emit("followup_updated", {
      followUp: f.toObject(),
      action: "CREATED",
    });

    io.to(`user:${assignedUser.id}`).emit("followup_updated", {
      followUp: f.toObject(),
      action: "CREATED",
    });
  }

  res.status(201).json({ followUp: f });
});

export default r;
