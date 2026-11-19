import { Lead } from "../models/Lead";
import { Business } from "../models/Business";
import { User } from "../models/User";
import { Notification } from "../models/Notification";
import { FollowUp } from "../models/FollowUp";
import { logActivity } from "../utils/activity";
import { chooseRandomSalesperson } from "./leadDelivery.service";
import { emitLeadEvent } from "../sockets";
import { sendMail, isMailConfigured } from "./mail.service";
import { logger } from "../config/logger";
import { env, appUrl } from "../config/env";

type BizSettings = { slaMinutes: number; autoReassignHours: number; dailyDigest: boolean };

async function settingsByBusiness(): Promise<Map<string, BizSettings>> {
  const list = await Business.find({ isActive: true }).select("_id settings").lean();
  return new Map(
    list.map((b: any) => [
      String(b._id),
      {
        slaMinutes: Number(b.settings?.slaMinutes || env.LEAD_SLA_MINUTES),
        autoReassignHours: Number(b.settings?.autoReassignHours || 0),
        dailyDigest: Boolean(b.settings?.dailyDigest),
      },
    ]),
  );
}

/**
 * SLA: a NEW lead nobody has contacted within `slaMinutes` alerts its salesperson;
 * at twice the SLA it escalates to the business owner (and admins).
 */
export async function processLeadSla(io: any) {
  const settings = await settingsByBusiness();
  const minSla = Math.min(env.LEAD_SLA_MINUTES, ...[...settings.values()].map((s) => s.slaMinutes));
  const cutoff = new Date(Date.now() - minSla * 60_000);
  const oldest = new Date(Date.now() - 3 * 24 * 60 * 60_000);

  const candidates = await Lead.find({
    status: "NEW",
    deliveryStatus: "RELEASED",
    lastContactAt: { $exists: false },
    assignedTo: { $exists: true },
    createdAt: { $lte: cutoff, $gte: oldest },
    $or: [{ slaAlertedAt: { $exists: false } }, { slaEscalatedAt: { $exists: false } }],
  })
    .select("_id name phone assignedTo assignedAt business createdAt slaAlertedAt slaEscalatedAt")
    .limit(200)
    .lean();

  for (const lead of candidates as any[]) {
    const sla = settings.get(String(lead.business))?.slaMinutes ?? env.LEAD_SLA_MINUTES;
    const startedAt = new Date(lead.assignedAt || lead.createdAt).getTime();
    const ageMin = (Date.now() - startedAt) / 60_000;

    if (!lead.slaAlertedAt && ageMin >= sla) {
      const claimed = await Lead.updateOne({ _id: lead._id, slaAlertedAt: { $exists: false } }, { $set: { slaAlertedAt: new Date() } });
      if (!claimed.modifiedCount) continue;
      await Notification.create({
        user: lead.assignedTo,
        type: "SLA_WARNING",
        title: "Lead waiting for first contact",
        message: `${lead.name}${lead.phone ? ` · ${lead.phone}` : ""} has not been contacted for ${Math.round(ageMin)} minutes.`,
        entityType: "Lead",
        entityId: String(lead._id),
      });
      io?.to(`user:${lead.assignedTo}`).emit("sla_warning", { leadId: String(lead._id), name: lead.name, minutes: Math.round(ageMin) });
    } else if (lead.slaAlertedAt && !lead.slaEscalatedAt && ageMin >= sla * 2) {
      const claimed = await Lead.updateOne({ _id: lead._id, slaEscalatedAt: { $exists: false } }, { $set: { slaEscalatedAt: new Date() } });
      if (!claimed.modifiedCount) continue;
      const owners = await User.find({
        isActive: true,
        $or: [{ role: { $in: ["ADMIN", "MANAGER"] } }, ...(lead.business ? [{ role: "BUSINESS", business: lead.business }] : [])],
      })
        .select("_id")
        .lean();
      const seller = await User.findById(lead.assignedTo).select("name").lean();
      if (owners.length) {
        await Notification.insertMany(
          owners.map((o) => ({
            user: o._id,
            type: "SLA_ESCALATION",
            title: "Lead SLA breached",
            message: `${lead.name} assigned to ${seller?.name || "a salesperson"} is still uncontacted after ${Math.round(ageMin)} minutes.`,
            entityType: "Lead",
            entityId: String(lead._id),
          })),
        );
      }
      await logActivity({
        lead: String(lead._id),
        type: "SLA_ESCALATED",
        title: "SLA escalated",
        description: `No first contact after ${Math.round(ageMin)} minutes.`,
      });
      emitLeadEvent(io, "sla_escalated", { leadId: String(lead._id), name: lead.name }, { business: lead.business });
    }
  }
}

/**
 * Auto-reassign: when a business enables it, a NEW lead untouched for N hours
 * moves to another available salesperson in the same project.
 */
export async function processAutoReassign(io: any) {
  const settings = await settingsByBusiness();
  for (const [businessId, s] of settings) {
    if (!s.autoReassignHours) continue;
    const cutoff = new Date(Date.now() - s.autoReassignHours * 60 * 60_000);
    const stale = await Lead.find({
      business: businessId,
      status: "NEW",
      deliveryStatus: "RELEASED",
      lastContactAt: { $exists: false },
      assignedTo: { $exists: true },
      assignedAt: { $lte: cutoff },
      businessProject: { $exists: true },
    })
      .limit(50);

    for (const lead of stale) {
      const previous = lead.assignedTo ? String(lead.assignedTo) : undefined;
      const next = await chooseRandomSalesperson(lead.businessProject);
      if (!next || String(next._id) === previous) continue;

      lead.assignedTo = next._id as any;
      lead.assignedAt = new Date();
      lead.assignmentSource = "AUTO";
      lead.slaAlertedAt = undefined;
      lead.slaEscalatedAt = undefined;
      await lead.save();

      await logActivity({
        lead: lead.id,
        actor: String(next._id),
        type: "LEAD_REASSIGNED",
        title: "Lead auto-reassigned",
        description: `Not contacted within ${s.autoReassignHours}h — moved to ${next.name}.`,
      });
      await Notification.create({
        user: next._id,
        type: "NEW_LEAD",
        title: "Lead reassigned to you",
        message: `${lead.name}${lead.phone ? ` · ${lead.phone}` : ""} was reassigned to you because it was not contacted in time.`,
        entityType: "Lead",
        entityId: lead.id,
      });
      if (previous) io?.to(`user:${previous}`).emit("lead_updated", { leadId: lead.id, reason: "UNASSIGNED" });
      emitLeadEvent(io, "new_lead", { lead: lead.toObject() }, { assignedTo: next._id, business: businessId });
    }
  }
}

let lastDigestDate = "";

/** Once a day (08:00–08:59 IST) email business owners who opted in a summary of yesterday. */
export async function processDailyDigests() {
  if (!isMailConfigured()) return;
  const now = new Date();
  const istHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(now));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
  if (istHour !== 8 || lastDigestDate === today) return;
  lastDigestDate = today;

  const businesses = await Business.find({ isActive: true, "settings.dailyDigest": true }).select("_id name").lean();
  const since = new Date(now.getTime() - 24 * 60 * 60_000);

  for (const b of businesses) {
    try {
      const owners = await User.find({ role: "BUSINESS", business: b._id, isActive: true }).select("email name").lean();
      if (!owners.length) continue;
      const [newLeads, won, uncontacted, overdue] = await Promise.all([
        Lead.countDocuments({ business: b._id, createdAt: { $gte: since } }),
        Lead.countDocuments({ business: b._id, status: "WON", updatedAt: { $gte: since } }),
        Lead.countDocuments({ business: b._id, status: "NEW", lastContactAt: { $exists: false } }),
        FollowUp.countDocuments({
          status: "PENDING",
          scheduledAt: { $lt: now },
          lead: { $in: await Lead.distinct("_id", { business: b._id }) },
        }),
      ]);
      const text = `Good morning,\n\nHere is the last 24 hours for ${b.name}:\n\n• New leads: ${newLeads}\n• Deals won: ${won}\n• Leads still waiting for first contact: ${uncontacted}\n• Overdue follow-ups: ${overdue}\n\nOpen your dashboard: ${appUrl}/business-dashboard\n\n— LeadFlow CRM`;
      for (const o of owners) {
        await sendMail({ to: o.email, subject: `${b.name} · Daily lead summary`, text });
      }
    } catch (error: any) {
      logger.warn("[digest] failed", { business: String(b._id), error: error?.message });
    }
  }
}
