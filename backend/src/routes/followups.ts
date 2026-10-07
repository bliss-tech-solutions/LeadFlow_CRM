import { Router } from "express";
import { FollowUp } from "../models/FollowUp";
import { Lead } from "../models/Lead";
import { User } from "../models/User";
import { Notification } from "../models/Notification";
import { auth } from "../middleware/auth";
import { logActivity } from "../utils/activity";

const r = Router();

function visibleFollowupFilter(req: any) {
  return req.user?.role === "ADMIN"
    ? {}
    : { user: req.user!.id };
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

async function notifyFollowup(req: any, followup: any, action: string, message: string) {
  const ownerId = String(followup.user?._id ?? followup.user);
  const leadId = String(followup.lead?._id ?? followup.lead);
  const recipients = await User.find({
    isActive: true,
    $or: [{ role: { $in: ["ADMIN", "MANAGER"] } }, { _id: ownerId }],
  }).select("_id").lean();

  if (recipients.length) {
    const titles: Record<string, string> = {
      FOLLOWUP_COMPLETED: "Follow-up completed",
      FOLLOWUP_CANCELLED: "Follow-up cancelled",
      FOLLOWUP_RESCHEDULED: "Follow-up rescheduled",
      FOLLOWUP_CREATED: "Follow-up scheduled",
      FOLLOWUP_REMINDER: "Follow-up reminder",
    };

    await Notification.insertMany(
      recipients.map((user) => ({
        user: user._id,
        type: action,
        title: titles[action] || "Follow-up updated",
        message,
        entityType: "Lead",
        entityId: leadId,
      })),
    );
  }

  const io = req.app.get("io");
  if (io) {
    const payload = {
      followUp: followup.toObject ? followup.toObject() : followup,
      action,
      actorId: req.user!.id,
    };
    io.to("role:ADMIN").emit("followup_updated", payload);
    io.to(`user:${ownerId}`).emit("followup_updated", payload);
  }
}

r.get("/stats", auth, async (req, res) => {
  const base = visibleFollowupFilter(req);
  const now = new Date();

  const [pending, completed, missed, cancelled, rescheduled, overdue] = await Promise.all([
    FollowUp.countDocuments({ ...base, status: "PENDING" }),
    FollowUp.countDocuments({ ...base, status: "COMPLETED" }),
    FollowUp.countDocuments({ ...base, status: "MISSED" }),
    FollowUp.countDocuments({ ...base, status: "CANCELLED" }),
    FollowUp.countDocuments({ ...base, status: "RESCHEDULED" }),
    FollowUp.countDocuments({ ...base, status: "PENDING", scheduledAt: { $lt: now } }),
  ]);

  res.json({ pending, completed, missed, cancelled, rescheduled, overdue });
});

r.get("/", auth, async (req, res) => {
  const {
    search = "",
    status = "",
    page = "1",
    limit = "10",
  } = req.query as Record<string, string>;

  const filter: any = visibleFollowupFilter(req);
  if (status) filter.status = status;

  const normalizedSearch = String(search).trim();
  if (normalizedSearch) {
    const matchingLeads = await Lead.find({
      $or: [
        { name: { $regex: normalizedSearch, $options: "i" } },
        { email: { $regex: normalizedSearch, $options: "i" } },
        { phone: { $regex: normalizedSearch, $options: "i" } },
      ],
    }).select("_id").lean();

    filter.lead = { $in: matchingLeads.map((item) => item._id) };
  }

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(50, Math.max(1, Number(limit) || 10));

  const [followups, total] = await Promise.all([
    FollowUp.find(filter)
      .populate("lead", "name email phone status")
      .populate("user", "name email")
      .sort({ createdAt: -1, updatedAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    FollowUp.countDocuments(filter),
  ]);

  res.json({ followups, total, page: p, pages: Math.ceil(total / l) });
});

async function getAccessibleFollowup(req: any, id: string) {
  return FollowUp.findOne({
    _id: id,
    ...visibleFollowupFilter(req),
  }).populate("lead", "name phone email status");
}

r.patch("/:id/complete", auth, async (req, res) => {
  const followup = await getAccessibleFollowup(req, req.params.id);
  if (!followup) return res.status(404).json({ message: "Follow-up not found" });
  if (followup.status !== "PENDING") {
    return res.status(409).json({ message: "Only pending follow-ups can be completed" });
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
  const followup = await getAccessibleFollowup(req, req.params.id);
  if (!followup) return res.status(404).json({ message: "Follow-up not found" });
  if (followup.status !== "PENDING") {
    return res.status(409).json({ message: "Only pending follow-ups can be cancelled" });
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
  const oldFollowup = await getAccessibleFollowup(req, req.params.id);
  if (!oldFollowup) return res.status(404).json({ message: "Follow-up not found" });
  if (oldFollowup.status !== "PENDING") {
    return res.status(409).json({ message: "Only pending follow-ups can be rescheduled" });
  }

  const scheduledAt = new Date(req.body?.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
    return res.status(400).json({ message: "Choose a valid future date and time" });
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

  // The original appointment is closed as CANCELLED. The newly-created
  // appointment is the active record and keeps `rescheduledFrom` so the
  // complete history remains visible. This prevents two active records
  // from representing the same client commitment.
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

  res.status(201).json({ followUp: activeFollowup, previousFollowUp: oldFollowup });
});

export default r;
