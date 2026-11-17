import { Types } from "mongoose";
import { LeadDeliverySchedule } from "../models/LeadDeliverySchedule";
import { Lead } from "../models/Lead";
import { User } from "../models/User";
import { Business } from "../models/Business";
import { BusinessProject } from "../models/BusinessProject";
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
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0,
  );

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
export type DeliveryScheduleState = "DISABLED" | "SCHEDULED" | "ACTIVE" | "EXPIRED";

export function getDeliveryScheduleState(schedule: {
  enabled: boolean;
  holdFrom?: Date | null;
  holdUntil?: Date | null;
}) : DeliveryScheduleState {
  if (!schedule.enabled) return "DISABLED";

  const now = Date.now();
  const start = schedule.holdFrom ? new Date(schedule.holdFrom).getTime() : NaN;
  const end = schedule.holdUntil ? new Date(schedule.holdUntil).getTime() : NaN;

  if (!Number.isFinite(start) || !Number.isFinite(end)) return "DISABLED";
  if (now < start) return "SCHEDULED";
  if (now >= start && now < end) return "ACTIVE";
  return "EXPIRED";
}

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
    .select("_id name email autoLeadCount autoLeadCountDate")
    .sort({ name: 1 })
    .lean();

  return users.map((user) => {
    const assignedToday =
      user.autoLeadCountDate === dateKey ? Number(user.autoLeadCount || 0) : 0;

    return {
      userId: String(user._id),
      name: user.name,
      email: user.email,
      assignedToday,
    };
  });
}

/**
 * Check whether a project or its business has exceeded its daily or monthly lead quota.
 */
export async function isLeadLimitReached(projectId?: string | Types.ObjectId): Promise<{ reached: boolean; reason?: string }> {
  if (!projectId) return { reached: false };

  const project = await BusinessProject.findById(projectId).select("business leadLimit leadLimitType").lean();
  if (!project) return { reached: false };

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // 1. Check project-level limit
  if (project.leadLimit && project.leadLimit > 0 && project.leadLimitType !== "NONE") {
    const since = project.leadLimitType === "DAILY" ? startOfDay : startOfMonth;
    const count = await Lead.countDocuments({
      businessProject: project._id,
      createdAt: { $gte: since },
    });
    if (count >= project.leadLimit) {
      return {
        reached: true,
        reason: `Project lead limit reached (${count}/${project.leadLimit} ${project.leadLimitType.toLowerCase()})`,
      };
    }
  }

  // 2. Check business-level limit
  if (project.business) {
    const business = await Business.findById(project.business).select("leadLimit leadLimitType").lean();
    if (business && business.leadLimit && business.leadLimit > 0 && business.leadLimitType !== "NONE") {
      const since = business.leadLimitType === "DAILY" ? startOfDay : startOfMonth;
      const projects = await BusinessProject.find({ business: business._id }).select("_id").lean();
      const pIds = projects.map((p) => p._id);
      const count = await Lead.countDocuments({
        businessProject: { $in: pIds },
        createdAt: { $gte: since },
      });
      if (count >= business.leadLimit) {
        return {
          reached: true,
          reason: `Business lead limit reached (${count}/${business.leadLimit} ${business.leadLimitType.toLowerCase()})`,
        };
      }
    }
  }

  return { reached: false };
}

/**
 * Atomically claim one available salesperson for an automatic lead assignment.
 * Strictly assigns ONLY to sales staff assigned under the project or the project's business.
 * NO fallback to unrelated staff.
 */
export async function chooseRandomSalesperson(projectId?: string | Types.ObjectId) {
  if (!projectId) return null;

  let projectObjId: Types.ObjectId | null = null;
  try {
    projectObjId = typeof projectId === "string" ? new Types.ObjectId(projectId) : (projectId as Types.ObjectId);
  } catch {
    return null;
  }

  // 1. Check project and business active status
  const project = await BusinessProject.findById(projectObjId).select("_id business isActive").lean();
  if (!project || project.isActive === false) {
    return null;
  }

  let businessObjId: Types.ObjectId | null = null;
  if (project.business) {
    const business = await Business.findById(project.business).select("_id isActive").lean();
    if (!business || business.isActive === false) {
      // Inactive business cannot be assigned leads
      return null;
    }
    businessObjId = business._id as Types.ObjectId;
  }

  const dateKey = await refreshDailyCounters();

  // 2. Query candidates:
  // Must be active SALES role.
  // Capacity check: autoLeadCount < dailyLeadLimit OR dailyLeadLimit <= 0 (unlimited)
  // Must match either:
  // - assignedProjects: projectObjId OR businessProject: projectObjId
  // - OR (if businessObjId exists): business: businessObjId AND (assignedProjects: { $size: 0 } OR assignedProjects: projectObjId OR assignedProjects: { $exists: false })
  const matchConditions: any[] = [
    { assignedProjects: projectObjId },
    { businessProject: projectObjId },
  ];

  if (businessObjId) {
    matchConditions.push({
      business: businessObjId,
      $or: [
        { assignedProjects: { $size: 0 } },
        { assignedProjects: { $exists: false } },
        { assignedProjects: projectObjId },
      ],
    });
  }

  const candidates = await User.aggregate([
    {
      $match: {
        role: "SALES",
        isActive: true,
        autoLeadCountDate: dateKey,
        $and: [
          { $or: matchConditions },
          {
            $or: [
              { dailyLeadLimit: { $lte: 0 } },
              { $expr: { $lt: ["$autoLeadCount", "$dailyLeadLimit"] } },
            ],
          },
        ],
      },
    },
    {
      $project: {
        _id: 1,
        autoLeadCount: 1,
        isProjectDirect: {
          $cond: [
            {
              $or: [
                { $in: [projectObjId, { $ifNull: ["$assignedProjects", []] }] },
                { $eq: ["$businessProject", projectObjId] },
              ],
            },
            1,
            2,
          ],
        },
      },
    },
    {
      $sort: {
        isProjectDirect: 1,
        autoLeadCount: 1,
      },
    },
  ]);

  if (!candidates.length) return null;

  // Group candidates with the same minimum load and shuffle for random distribution
  const bestPriority = candidates[0].isProjectDirect;
  const bestLoad = candidates[0].autoLeadCount;
  const topCandidates = candidates.filter(
    (c) => c.isProjectDirect === bestPriority && c.autoLeadCount === bestLoad,
  );

  const shuffledIds = topCandidates.map((c) => c._id);
  for (let i = shuffledIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledIds[i], shuffledIds[j]] = [shuffledIds[j], shuffledIds[i]];
  }

  const remainingIds = candidates
    .filter((c) => !topCandidates.some((t) => String(t._id) === String(c._id)))
    .map((c) => c._id);
  const candidateIds = [...shuffledIds, ...remainingIds];

  for (const id of candidateIds) {
    const claimed = await User.findOneAndUpdate(
      {
        _id: id,
        role: "SALES",
        isActive: true,
        autoLeadCountDate: dateKey,
        $or: [
          { dailyLeadLimit: { $lte: 0 } },
          { $expr: { $lt: ["$autoLeadCount", "$dailyLeadLimit"] } },
        ],
      },
      {
        $inc: { autoLeadCount: 1 },
      },
      {
        new: true,
      },
    )
      .select("_id name email")
      .lean();

    if (claimed) return claimed;
  }

  return null;
}

/**
 * Put all open/new leads for a specific business on hold when it becomes inactive.
 */
export async function holdBusinessLeads(businessId: string | Types.ObjectId, io?: any) {
  let bId: Types.ObjectId;
  try {
    bId = typeof businessId === "string" ? new Types.ObjectId(businessId) : (businessId as Types.ObjectId);
  } catch {
    return { heldCount: 0 };
  }

  const business = await Business.findById(bId).select("name").lean();
  const businessName = business?.name || "Business";

  const projects = await BusinessProject.find({ business: bId }).select("_id").lean();
  const projectIds = projects.map((p) => p._id);

  if (!projectIds.length) {
    return { heldCount: 0 };
  }

  // Hold NEW leads that are currently released
  const leadsToHold = await Lead.find({
    businessProject: { $in: projectIds },
    deliveryStatus: "RELEASED",
    status: "NEW",
  }).select("_id name assignedTo");

  if (!leadsToHold.length) {
    return { heldCount: 0 };
  }

  const leadIds = leadsToHold.map((l) => l._id);

  await Lead.updateMany(
    { _id: { $in: leadIds } },
    {
      $set: {
        deliveryStatus: "HELD",
        heldUntil: undefined,
      },
      $unset: {
        assignedTo: 1,
        assignedAt: 1,
        assignmentSource: 1,
      },
    },
  );

  for (const lead of leadsToHold) {
    await logActivity({
      lead: String(lead._id),
      type: "LEAD_HELD",
      title: "Lead held (Business deactivated)",
      description: `Lead placed on hold because ${businessName} was deactivated by admin.`,
    }).catch(() => {});
  }

  if (io) {
    io.to("role:ADMIN").emit("leads_held", {
      businessId: String(bId),
      count: leadsToHold.length,
    });
    for (const lead of leadsToHold) {
      if (lead.assignedTo) {
        io.to(`user:${lead.assignedTo}`).emit("lead_updated", {
          leadId: String(lead._id),
          reason: "HELD",
        });
      }
    }
  }

  return { heldCount: leadsToHold.length };
}

/**
 * Release and assign all held leads for a specific business when it becomes active.
 */
export async function releaseBusinessHeldLeads(businessId: string | Types.ObjectId, io?: any) {
  let bId: Types.ObjectId;
  try {
    bId = typeof businessId === "string" ? new Types.ObjectId(businessId) : (businessId as Types.ObjectId);
  } catch {
    return { released: 0, waitingForCapacity: false };
  }

  const business = await Business.findById(bId).select("name isActive").lean();
  if (!business || business.isActive === false) {
    return { released: 0, waitingForCapacity: false };
  }

  const projects = await BusinessProject.find({ business: bId, isActive: true }).select("_id").lean();
  const projectIds = projects.map((p) => p._id);

  if (!projectIds.length) {
    return { released: 0, waitingForCapacity: false };
  }

  const leads = await Lead.find({
    businessProject: { $in: projectIds },
    deliveryStatus: "HELD",
  })
    .sort({ createdAt: 1 })
    .limit(500);

  if (!leads.length) {
    return { released: 0, waitingForCapacity: false };
  }

  let released = 0;
  let waitingForCapacity = false;

  for (const lead of leads) {
    const limitCheck = await isLeadLimitReached(lead.businessProject);
    if (limitCheck.reached) {
      continue;
    }

    const assignee = await chooseRandomSalesperson(lead.businessProject);
    if (!assignee) {
      waitingForCapacity = true;
      continue;
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
      description: `Lead released and assigned to ${assignee.name} after business activated.`,
    });

    await Notification.insertMany([
      {
        user: assignee._id,
        type: "NEW_LEAD",
        title: "New lead released",
        message: `${lead.name} is now available and assigned to you.`,
        entityType: "Lead",
        entityId: lead.id,
      },
      ...(
        await User.find({
          role: { $in: ["ADMIN", "MANAGER"] },
          isActive: true,
        })
          .select("_id")
          .lean()
      ).map((admin) => ({
        user: admin._id,
        type: "HELD_LEAD_RELEASED",
        title: "Held lead released",
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
    waitingForCapacity,
  };
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

  // Filter out held leads belonging to inactive businesses or inactive projects
  const inactiveBusinesses = await Business.find({ isActive: false }).select("_id").lean();
  const inactiveBizIds = inactiveBusinesses.map((b) => b._id);

  const inactiveProjects = await BusinessProject.find({
    $or: [{ isActive: false }, { business: { $in: inactiveBizIds } }],
  }).select("_id").lean();
  const excludedProjectIds = inactiveProjects.map((p) => p._id);

  const leads = await Lead.find({
    deliveryStatus: "HELD",
    ...(excludedProjectIds.length > 0 ? { businessProject: { $nin: excludedProjectIds } } : {}),
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
    const limitCheck = await isLeadLimitReached(lead.businessProject);
    if (limitCheck.reached) {
      continue;
    }
    const assignee = await chooseRandomSalesperson(lead.businessProject);

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
          role: { $in: ["ADMIN", "MANAGER"] },
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
