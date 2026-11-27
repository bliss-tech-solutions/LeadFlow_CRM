import { Types } from "mongoose";
import { Lead } from "../models/Lead";
import { User } from "../models/User";
import { Notification } from "../models/Notification";

type Id = string | Types.ObjectId | null | undefined;

/**
 * Everyone who should hear about something that happened on a lead:
 * admins/managers, the business owner(s) of the lead's business, the assigned
 * salesperson, plus any extra users. The person who caused the event is left out.
 */
export async function leadAudience(
  leadId: Id,
  opts: { exclude?: Id[]; include?: Id[]; admins?: boolean } = {},
): Promise<string[]> {
  const lead: any = leadId ? await Lead.findById(leadId).select("business assignedTo").lean() : null;

  const or: any[] = [];
  if (opts.admins !== false) or.push({ role: { $in: ["ADMIN", "MANAGER"] } });
  if (lead?.business) or.push({ role: "BUSINESS", business: lead.business });

  const ids = new Set<string>();
  if (or.length) {
    const users = await User.find({ isActive: true, $or: or }).select("_id").lean();
    users.forEach((u) => ids.add(String(u._id)));
  }
  for (const id of [lead?.assignedTo, ...(opts.include || [])]) if (id) ids.add(String(id));
  for (const id of opts.exclude || []) if (id) ids.delete(String(id));
  return [...ids];
}

/** Store one notification per recipient. The Notification model pushes + emits realtime. */
export async function notifyUsers(
  userIds: string[],
  n: { type: string; title: string; message: string; entityType?: string; entityId?: string },
) {
  if (!userIds.length) return;
  await Notification.insertMany(userIds.map((user) => ({ user, ...n })));
}

/** Notify the whole audience of a lead. */
export async function notifyLeadAudience(
  leadId: Id,
  n: { type: string; title: string; message: string },
  opts: { exclude?: Id[]; include?: Id[]; admins?: boolean } = {},
) {
  const users = await leadAudience(leadId, opts);
  await notifyUsers(users, { ...n, entityType: "Lead", entityId: leadId ? String(leadId) : undefined });
}
