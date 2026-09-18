import { LeadDeliverySchedule } from "../models/LeadDeliverySchedule";
import { Lead } from "../models/Lead";
import { User } from "../models/User";
import { Notification } from "../models/Notification";
import { logActivity } from "../utils/activity";

function getDateKey(timezone = "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";

  return `${year}-${month}-${day}`;
}

function minutes(value: string) {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

function currentMinutesInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);

  return hour * 60 + minute;
}


/**
 * Return the single global lead-delivery schedule used by the CRM.
 */
export async function getDeliverySchedule() {
  let schedule = await LeadDeliverySchedule.findOne().sort({ createdAt: 1 });

  if (!schedule) {
    schedule = await LeadDeliverySchedule.create({
      enabled: false,
      timezone: "Asia/Kolkata",
    });
  }

  return schedule;
}


/**
 * Check whether the current instant is inside the configured hold window.
 */
export function isWithinHoldWindow(schedule: {
  enabled: boolean;
  holdFrom?: Date | null;
  holdUntil?: Date | null;
  holdStart?: string;
  holdEnd?: string;
  timezone: string;
}) {
  if (!schedule.enabled) return false;

  const now = Date.now();

  if (schedule.holdFrom && schedule.holdUntil) {
    const start = new Date(schedule.holdFrom).getTime();
    const end = new Date(schedule.holdUntil).getTime();

    return now >= start && now < end;
  }

  if (!schedule.holdStart || !schedule.holdEnd) return false;

  const current = currentMinutesInTimezone(schedule.timezone);
  const start = minutes(schedule.holdStart);
  const end = minutes(schedule.holdEnd);

  if (start === end) return true;
  if (start > end) return current >= start || current < end;

  return current >= start && current < end;
}


/**
 * Synchronize automatic assignment counters with released AUTO assignments for today.
 * This keeps existing CRM data compatible with the capacity feature.
 */
async function refreshDailyCounters(timezone = "Asia/Kolkata") {
  const dateKey = getDateKey(timezone);
  const users = await User.find({
    role: "SALES",
    isActive: true,
  }).select("_id");

  const counts = await Lead.aggregate([
    {
      $match: {
        assignedTo: { $exists: true },
        assignmentSource: "AUTO",
        deliveryStatus: "RELEASED",
        assignedAt: { $exists: true },
      },
    },
    {
      $group: {
        _id: {
          userId: "$assignedTo",
          day: {
            $dateToString: {
              date: "$assignedAt",
              format: "%Y-%m-%d",
              timezone,
            },
          },
        },
        count: { $sum: 1 },
      },
    },
    {
      $match: {
        "_id.day": dateKey,
      },
    },
  ]);

  const countMap = new Map(
    counts.map((item) => [String(item._id.userId), Number(item.count || 0)]),
  );

  await Promise.all(
    users.map((user) =>
      User.updateOne(
        { _id: user._id },
        {
          $set: {
            autoLeadCount: countMap.get(String(user._id)) || 0,
            autoLeadCountDate: dateKey,
          },
        },
      ),
    ),
  );

  return dateKey;
}


/**
 * Return today's automatic lead capacity for every active salesperson.
 */
export async function getSalesCapacity(timezone = "Asia/Kolkata") {
  const dateKey = await refreshDailyCounters(timezone);

  const users = await User.find({
    role: "SALES",
    isActive: true,
  })
    .select("_id name email dailyLeadLimit autoLeadCount autoLeadCountDate")
    .sort({ name: 1 })
    .lean();

  return users.map((user) => {
    const assignedToday =
      user.autoLeadCountDate === dateKey
        ? Number(user.autoLeadCount || 0)
        : 0;
    const limit = Math.max(0, Number(user.dailyLeadLimit ?? 5));

    return {
      userId: String(user._id),
      name: user.name,
      email: user.email,
      dailyLeadLimit: limit,
      assignedToday,
      remaining: Math.max(0, limit - assignedToday),
      atCapacity: assignedToday >= limit,
    };
  });
}


/**
 * Atomically claim one available salesperson for an automatic lead assignment.
 * Manual assignments never use or consume this capacity.
 */
export async function chooseRandomSalesperson() {
  const dateKey = await refreshDailyCounters();

  const candidates = await User.aggregate([
    {
      $match: {
        role: "SALES",
        isActive: true,
        autoLeadCountDate: dateKey,
      },
    },
    {
      $match: {
        $expr: {
          $lt: ["$autoLeadCount", "$dailyLeadLimit"],
        },
      },
    },
    { $project: { _id: 1 } },
  ]);

  if (!candidates.length) return null;

  const ids = candidates.map((candidate) => candidate._id);

  for (let index = ids.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [ids[index], ids[randomIndex]] = [ids[randomIndex], ids[index]];
  }

  for (const id of ids) {
    const claimed = await User.findOneAndUpdate(
      {
        _id: id,
        role: "SALES",
        isActive: true,
        autoLeadCountDate: dateKey,
        $expr: {
          $lt: ["$autoLeadCount", "$dailyLeadLimit"],
        },
      },
      {
        $inc: { autoLeadCount: 1 },
      },
      {
        new: true,
      },
    )
      .select("_id name email dailyLeadLimit")
      .lean();

    if (claimed) return claimed;
  }

  return null;
}


/**
 * Release held leads after the exact hold window ends and deliver them normally.
 */
export async function releaseHeldLeads(io: any) {
  const schedule = await getDeliverySchedule();

  if (isWithinHoldWindow(schedule)) {
    return {
      released: 0,
      held: true,
      waitingForCapacity: false,
    };
  }

  const leads = await Lead.find({
    deliveryStatus: "HELD",
  })
    .sort({ createdAt: 1 })
    .limit(500);

  if (!leads.length) {
    return {
      released: 0,
      held: false,
      waitingForCapacity: false,
    };
  }

  let released = 0;
  let waitingForCapacity = false;

  for (const lead of leads) {
    const assignee = await chooseRandomSalesperson();

    if (!assignee) {
      waitingForCapacity = true;
      break;
    }

    lead.deliveryStatus = "RELEASED";
    lead.heldUntil = undefined;
    lead.assignedTo = assignee._id;
    lead.assignedAt = new Date();
    lead.assignmentSource = "AUTO";
    await lead.save();

    await logActivity({
      lead: lead.id,
      actor: String(assignee._id),
      type: "LEAD_RELEASED",
      title: "Held lead released",
      description: `Lead released and assigned to ${assignee.name}.`,
    });

    await Notification.insertMany([
      {
        user: assignee._id,
        type: "NEW_LEAD",
        title: "New Meta lead",
        message: `${lead.name} is now available and assigned to you.`,
        entityType: "Lead",
        entityId: lead.id,
      },
      ...(
        await User.find({
          role: "ADMIN",
          isActive: true,
        })
          .select("_id")
          .lean()
      ).map((admin) => ({
        user: admin._id,
        type: "HELD_LEAD_RELEASED",
        title: "Held Meta lead released",
        message: `${lead.name} was released and assigned to ${assignee.name}.`,
        entityType: "Lead",
        entityId: lead.id,
      })),
    ]);

    if (io) {
      io.to("role:ADMIN").emit("new_lead", {
        lead: lead.toObject(),
      });

      io.to(`user:${assignee._id}`).emit("new_lead", {
        lead: lead.toObject(),
      });
    }

    released += 1;
  }

  return {
    released,
    held: false,
    waitingForCapacity,
  };
}
