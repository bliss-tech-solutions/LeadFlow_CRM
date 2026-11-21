import { FollowUp } from "../models/FollowUp";
import { Notification } from "../models/Notification";
import { User } from "../models/User";
import { logActivity } from "../utils/activity";

/**
 * Send a follow-up reminder once the appointment's exact 24-hour reminder time
 * has been reached. The job can run hourly; the reminderAt field makes the
 * check deterministic and prevents duplicate notifications.
 */
export async function processFollowupReminders(io: any) {
  const now = new Date();
  // The worker runs hourly. Looking one hour ahead ensures the reminder is
  // delivered before the exact 24-hour point for appointments between hourly runs.
  const reminderWindowEnd = new Date(now.getTime() + 60 * 60 * 1000);
  let processed = 0;

  // Process in small batches so a busy CRM does not hold the event loop.
  for (let i = 0; i < 200; i += 1) {
    const due = await FollowUp.findOneAndUpdate(
      {
        status: "PENDING",
        scheduledAt: { $gt: now },
        $and: [
          {
            $or: [
              { reminderAt: { $lte: reminderWindowEnd } },
              // Backward compatibility for follow-ups created before reminderAt existed.
              {
                reminderAt: { $exists: false },
                scheduledAt: { $gt: now, $lte: new Date(reminderWindowEnd.getTime() + 24 * 60 * 60 * 1000) },
              },
            ],
          },
          {
            $or: [
              { reminder24hSentAt: { $exists: false } },
              { reminder24hSentAt: null },
            ],
          },
        ],
      },
      {
        $set: { reminder24hSentAt: now },
      },
      { new: true },
    )
      .populate("lead", "name phone email")
      .populate("user", "name email")
      .lean();

    if (!due) break;

    // Backfill reminderAt for old records without changing their appointment.
    if (!due.reminderAt) {
      await FollowUp.updateOne(
        { _id: due._id, reminderAt: { $exists: false } },
        { $set: { reminderAt: new Date(new Date(due.scheduledAt).getTime() - 24 * 60 * 60 * 1000) } },
      );
    }

    await sendReminder(io, due);
    processed += 1;
  }

  // Second, short reminder ~15 minutes before the appointment — only to the owner,
  // so the salesperson's phone buzzes right before the call.
  const soon = new Date(now.getTime() + 15 * 60 * 1000);
  for (let i = 0; i < 200; i += 1) {
    const due: any = await FollowUp.findOneAndUpdate(
      { status: "PENDING", scheduledAt: { $gt: now, $lte: soon }, reminder15mSentAt: { $exists: false } },
      { $set: { reminder15mSentAt: now } },
      { new: true },
    )
      .populate("lead", "name phone")
      .lean();
    if (!due) break;
    const leadId = String(due.lead?._id ?? due.lead);
    const at = new Date(due.scheduledAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
    await Notification.create({
      user: due.user,
      type: "FOLLOWUP_DUE_SOON",
      title: `${String(due.type || "Follow-up").replace(/_/g, " ")} at ${at}`,
      message: `${due.lead?.name || "Lead"}${due.lead?.phone ? ` · ${due.lead.phone}` : ""} — starting in 15 minutes.`,
      entityType: "Lead",
      entityId: leadId,
    });
    if (io) io.to(`user:${String(due.user)}`).emit("followup_reminder", { followUp: due, action: "DUE_SOON" });
    processed += 1;
  }

  return processed;
}

async function sendReminder(io: any, followup: any) {
  const ownerId = String(followup.user?._id ?? followup.user);
  const leadId = String(followup.lead?._id ?? followup.lead);
  const leadName = followup.lead?.name || "Lead";
  const scheduled = new Date(followup.scheduledAt).toLocaleString();

  const recipients = await User.find({
    isActive: true,
    $or: [{ role: { $in: ["ADMIN", "MANAGER"] } }, { _id: ownerId }],
  }).select("_id").lean();

  await Notification.insertMany(
    recipients.map((user) => ({
      user: user._id,
      type: "FOLLOWUP_REMINDER",
      title: "Follow-up reminder",
      message: `${leadName} has a ${followup.type} follow-up tomorrow at ${scheduled}.`,
      entityType: "Lead",
      entityId: leadId,
    })),
  );


  await logActivity({
    lead: leadId,
    type: "FOLLOWUP_REMINDER",
    title: "24-hour follow-up reminder sent",
    description: `Reminder sent for ${scheduled}.`,
    metadata: { followUpId: String(followup._id) },
  });

  if (io) {
    const payload = { followUp: followup, action: "REMINDER" };
    io.to("role:ADMIN").emit("followup_reminder", payload);
    io.to(`user:${ownerId}`).emit("followup_reminder", payload);
  }
}
