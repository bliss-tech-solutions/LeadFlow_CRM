import { Router } from "express";
import { FollowUp } from "../models/FollowUp";
import { Lead } from "../models/Lead";
import { auth } from "../middleware/auth";
import { logActivity } from "../utils/activity";
import { Notification } from "../models/Notification";
import { User } from "../models/User";

const r = Router();

/**
 * Build the follow-up visibility filter for the current user.
 */
function visibleFollowupFilter(req: any) {
  return req.user?.role === "ADMIN" ? {} : { user: req.user!.id };
}

/**
 * GET /api/followups/stats
 * Return follow-up statistics scoped to the current user's assigned work.
 */
r.get("/stats", auth, async (req, res) => {
  const base = visibleFollowupFilter(req);
  const now = new Date();

  const [pending, completed, missed, cancelled, overdue] = await Promise.all([
    FollowUp.countDocuments({ ...base, status: "PENDING" }),
    FollowUp.countDocuments({ ...base, status: "COMPLETED" }),
    FollowUp.countDocuments({ ...base, status: "MISSED" }),
    FollowUp.countDocuments({ ...base, status: "CANCELLED" }),
    FollowUp.countDocuments({
      ...base,
      status: "PENDING",
      scheduledAt: { $lt: now },
    }),
  ]);

  res.json({
    pending,
    completed,
    missed,
    cancelled,
    overdue,
  });
});

/**
 * GET /api/followups
 * List follow-ups visible to the current user.
 */
r.get("/", auth, async (req, res) => {
  const followups = await FollowUp.find(visibleFollowupFilter(req))
    .populate("lead", "name email phone status")
    .populate("user", "name email")
    .sort({ scheduledAt: 1 });

  res.json({ followups });
});

/**
 * PATCH /api/followups/:id/complete
 * Complete an assigned follow-up and notify only its owner and admins.
 */
r.patch("/:id/complete", auth, async (req, res) => {
  const followup = await FollowUp.findById(req.params.id)
    .populate("lead", "name phone email status")
    .populate("user", "name email");

  if (!followup) {
    return res.status(404).json({ message: "Follow-up not found" });
  }

  if (followup.status === "COMPLETED") {
    return res.status(409).json({ message: "Follow-up is already completed" });
  }

  const ownerId = String((followup.user as any)?._id ?? followup.user);

  if (req.user?.role !== "ADMIN" && ownerId !== req.user!.id) {
    return res
      .status(403)
      .json({ message: "You do not have access to this follow-up" });
  }

  followup.status = "COMPLETED";
  followup.completedAt = new Date();

  const note = String(req.body?.completionNote ?? "").trim();

  if (note) {
    followup.notes = followup.notes
      ? `${followup.notes}\n\nCompletion: ${note}`
      : `Completion: ${note}`;
  }

  await followup.save();

  const leadId = String((followup.lead as any)?._id ?? followup.lead);

  await Lead.findByIdAndUpdate(leadId, {
    nextFollowUpAt: null,
  });

  await logActivity({
    lead: leadId,
    actor: req.user!.id,
    type: "FOLLOWUP_COMPLETED",
    title: "Follow-up completed",
    description: note || "Scheduled follow-up marked completed.",
  });

  const recipients = await User.find({
    isActive: true,
    $or: [{ role: "ADMIN" }, { _id: ownerId }],
  })
    .select("_id")
    .lean();

  await Notification.insertMany(
    recipients.map((user) => ({
      user: user._id,
      type: "FOLLOWUP_COMPLETED",
      title: "Follow-up completed",
      message: `${(followup.lead as any)?.name || "Lead"} follow-up was completed.`,
      entityType: "Lead",
      entityId: leadId,
    })),
  );

  const io = req.app.get("io");

  if (io) {
    const payload = {
      followUp: followup.toObject(),
      action: "COMPLETED",
    };

    io.to("role:ADMIN").emit("followup_updated", payload);
    io.to(`user:${ownerId}`).emit("followup_updated", payload);
  }

  res.json({ followUp: followup });
});

export default r;
