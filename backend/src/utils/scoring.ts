import { Lead } from "../models/Lead";
import { Call } from "../models/Call";

type ScoreInput = {
  status?: string;
  email?: string | null;
  phone?: string | null;
  fieldCount?: number;
  connectedCalls?: number;
  missedCalls?: number;
  hasFollowup?: boolean;
  ageHours?: number;
};

/**
 * Rule-based lead score (0-100). Transparent and explainable on purpose,
 * so sales teams can trust why a lead is "hot".
 */
export function computeLeadScore(i: ScoreInput): number {
  if (i.status === "WON") return 100;
  if (i.status === "LOST" || i.status === "NOT_INTERESTED") return 0;

  let score = 30;
  if (i.phone) score += 10;
  if (i.email) score += 5;
  score += Math.min(10, (i.fieldCount || 0) * 2);

  switch (i.status) {
    case "CONTACTED":
      score += 10;
      break;
    case "FOLLOW_UP":
      score += 12;
      break;
    case "INTERESTED":
      score += 25;
      break;
    case "SCHEDULED":
      score += 30;
      break;
  }

  score += Math.min(15, (i.connectedCalls || 0) * 5);
  score -= Math.min(20, (i.missedCalls || 0) * 5);
  if (i.hasFollowup) score += 5;

  // Fresh leads convert better; decay slowly after the first two days.
  if (i.ageHours !== undefined && i.ageHours > 48 && (i.status === "NEW" || !i.status)) {
    score -= Math.min(15, Math.floor((i.ageHours - 48) / 24) * 3);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Recompute and persist the score for one lead. Never throws. */
export async function refreshLeadScore(leadId: string) {
  try {
    const lead: any = await Lead.findById(leadId)
      .select("status email phone meta.fieldData nextFollowUpAt createdAt")
      .lean();
    if (!lead) return;
    const [connectedCalls, missedCalls] = await Promise.all([
      Call.countDocuments({ lead: leadId, result: "CONNECTED" }),
      Call.countDocuments({ lead: leadId, result: { $in: ["NOT_PICKED", "BUSY"] } }),
    ]);
    const score = computeLeadScore({
      status: lead.status,
      email: lead.email,
      phone: lead.phone,
      fieldCount: Array.isArray(lead.meta?.fieldData) ? lead.meta.fieldData.length : 0,
      connectedCalls,
      missedCalls,
      hasFollowup: Boolean(lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) > new Date()),
      ageHours: (Date.now() - new Date(lead.createdAt).getTime()) / 3_600_000,
    });
    await Lead.updateOne({ _id: leadId }, { $set: { score } });
  } catch {
    // scoring is best-effort
  }
}
