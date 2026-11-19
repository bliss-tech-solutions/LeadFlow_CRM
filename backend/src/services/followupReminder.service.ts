import { FollowUp } from "../models/FollowUp";
import { Notification } from "../models/Notification";
import { User } from "../models/User";
import { logActivity } from "../utils/activity";
import { sendPushNotification } from "./push.service";

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

  // Send Push Notifications to assigned user and admins
  void sendPushNotification(recipients.map(r => r._id), {
    title: `Follow-up: ${leadName}`,
    body: `${followup.type} scheduled for ${scheduled}`,
    data: { leadId, followupId: String(followup._id), type: "FOLLOWUP_REMINDER" },
    channelId: "followups",
  }).catch(() => undefined);

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
