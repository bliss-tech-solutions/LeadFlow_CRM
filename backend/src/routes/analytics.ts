import { Router } from "express";
import { Types } from "mongoose";
import { auth } from "../middleware/auth";
import { Lead } from "../models/Lead";
import { Call } from "../models/Call";
import { FollowUp } from "../models/FollowUp";
import { User } from "../models/User";
import { visibleLeadFilter } from "../utils/leadAccess";

const r = Router();
const TZ = "Asia/Kolkata";

function dateRange(query: Record<string, string>) {
  const to = query.to && !Number.isNaN(Date.parse(query.to)) ? new Date(query.to) : new Date();
  to.setHours(23, 59, 59, 999);
  const from = query.from && !Number.isNaN(Date.parse(query.from))
    ? new Date(query.from)
    : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

/** Convert visibleLeadFilter output (string ids) into an aggregation-safe $match. */
function toMatch(filter: Record<string, any>) {
  const m: Record<string, any> = { ...filter };
  const cast = (v: any) => (typeof v === "string" && Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : v);
  if (m.assignedTo) m.assignedTo = cast(m.assignedTo);
  if (m.businessProject) {
    if (m.businessProject.$in) m.businessProject = { $in: m.businessProject.$in.map(cast) };
    else m.businessProject = cast(m.businessProject);
  }
  return m;
}

/**
 * GET /api/analytics/overview?from&to&business&businessProject
 * Funnel, trends, sources, campaigns, response time and lost reasons — always
 * limited to the leads the caller is allowed to see.
 */
r.get("/overview", auth, async (req, res) => {
  const { from, to } = dateRange(req.query as Record<string, string>);
  const scope = toMatch(await visibleLeadFilter(req));
  const match = { $and: [scope, { createdAt: { $gte: from, $lte: to } }] };
  /** Add conditions without ever overriding a tenant-scope key. */
  const and = (extra: Record<string, unknown>) => ({ $and: [...match.$and, extra] });

  const [trend, bySource, byCampaign, byStatus, byProject, response, lostReasons, totals] = await Promise.all([
    Lead.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone: TZ } }, leads: { $sum: 1 }, won: { $sum: { $cond: [{ $eq: ["$status", "WON"] }, 1, 0] } } } },
      { $sort: { _id: 1 } },
    ]),
    Lead.aggregate([{ $match: match }, { $group: { _id: "$source", count: { $sum: 1 }, won: { $sum: { $cond: [{ $eq: ["$status", "WON"] }, 1, 0] } } } }, { $sort: { count: -1 } }]),
    Lead.aggregate([
      { $match: and({ campaign: { $nin: [null, ""] } }) },
      { $group: { _id: "$campaign", count: { $sum: 1 }, won: { $sum: { $cond: [{ $eq: ["$status", "WON"] }, 1, 0] } } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    Lead.aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Lead.aggregate([
      { $match: and({ businessProject: { $ne: null } }) },
      { $group: { _id: "$businessProject", count: { $sum: 1 }, won: { $sum: { $cond: [{ $eq: ["$status", "WON"] }, 1, 0] } } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $lookup: { from: "businessprojects", localField: "_id", foreignField: "_id", as: "project" } },
      { $project: { count: 1, won: 1, name: { $ifNull: [{ $arrayElemAt: ["$project.name", 0] }, "Unknown"] } } },
    ]),
    Lead.aggregate([
      { $match: and({ firstContactAt: { $exists: true } }) },
      { $project: { minutes: { $divide: [{ $subtract: ["$firstContactAt", { $ifNull: ["$assignedAt", "$createdAt"] }] }, 60000] } } },
      { $match: { minutes: { $gte: 0 } } },
      { $group: { _id: null, avg: { $avg: "$minutes" }, within15: { $sum: { $cond: [{ $lte: ["$minutes", 15] }, 1, 0] } }, count: { $sum: 1 } } },
    ]),
    Lead.aggregate([
      { $match: and({ status: { $in: ["LOST", "NOT_INTERESTED"] }, lostReason: { $nin: [null, ""] } }) },
      { $group: { _id: "$lostReason", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    Lead.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          won: { $sum: { $cond: [{ $eq: ["$status", "WON"] }, 1, 0] } },
          dealValue: { $sum: { $cond: [{ $eq: ["$status", "WON"] }, { $ifNull: ["$dealValue", 0] }, 0] } },
          contacted: { $sum: { $cond: [{ $ifNull: ["$firstContactAt", false] }, 1, 0] } },
          duplicates: { $sum: { $cond: [{ $ifNull: ["$duplicateOf", false] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const t = totals[0] || { total: 0, won: 0, dealValue: 0, contacted: 0, duplicates: 0 };
  const resp = response[0];
  res.json({
    range: { from, to },
    totals: {
      leads: t.total,
      won: t.won,
      conversionRate: t.total ? Math.round((t.won / t.total) * 1000) / 10 : 0,
      contactRate: t.total ? Math.round((t.contacted / t.total) * 1000) / 10 : 0,
      dealValue: t.dealValue,
      duplicates: t.duplicates,
      avgFirstResponseMinutes: resp ? Math.round(resp.avg) : null,
      respondedWithin15Pct: resp?.count ? Math.round((resp.within15 / resp.count) * 1000) / 10 : null,
    },
    trend: trend.map((d) => ({ date: d._id, leads: d.leads, won: d.won })),
    bySource: bySource.map((s) => ({ source: s._id || "UNKNOWN", count: s.count, won: s.won })),
    byCampaign: byCampaign.map((c) => ({ campaign: c._id, count: c.count, won: c.won })),
    byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
    byProject: byProject.map((p) => ({ projectId: p._id, name: p.name, count: p.count, won: p.won })),
    lostReasons: lostReasons.map((l) => ({ reason: l._id, count: l.count })),
  });
});

/**
 * GET /api/analytics/team?from&to
 * Salesperson leaderboard. ADMIN: everyone; BUSINESS: own staff; SALES: self.
 */
r.get("/team", auth, async (req, res) => {
  const { from, to } = dateRange(req.query as Record<string, string>);
  const u = req.user!;

  const userFilter: Record<string, unknown> = { role: "SALES" };
  if (u.role === "SALES") userFilter._id = u.id;
  else if (u.role === "BUSINESS") userFilter.business = u.business || null;
  else if (req.query.business && Types.ObjectId.isValid(String(req.query.business))) userFilter.business = req.query.business;

  const people = await User.find(userFilter).select("_id name email isActive profilePhotoUrl").lean();
  const ids = people.map((p) => p._id);
  if (!ids.length) return res.json({ range: { from, to }, team: [] });

  const leadMatch = { assignedTo: { $in: ids }, assignedAt: { $gte: from, $lte: to } };

  const [leadStats, callStats, followStats] = await Promise.all([
    Lead.aggregate([
      { $match: leadMatch },
      {
        $group: {
          _id: "$assignedTo",
          assigned: { $sum: 1 },
          contacted: { $sum: { $cond: [{ $ifNull: ["$firstContactAt", false] }, 1, 0] } },
          won: { $sum: { $cond: [{ $eq: ["$status", "WON"] }, 1, 0] } },
          lost: { $sum: { $cond: [{ $in: ["$status", ["LOST", "NOT_INTERESTED"]] }, 1, 0] } },
          dealValue: { $sum: { $cond: [{ $eq: ["$status", "WON"] }, { $ifNull: ["$dealValue", 0] }, 0] } },
          responseMinutes: {
            $avg: {
              $cond: [
                { $ifNull: ["$firstContactAt", false] },
                { $divide: [{ $subtract: ["$firstContactAt", { $ifNull: ["$assignedAt", "$createdAt"] }] }, 60000] },
                null,
              ],
            },
          },
        },
      },
    ]),
    Call.aggregate([
      { $match: { user: { $in: ids }, createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: "$user", calls: { $sum: 1 }, connected: { $sum: { $cond: [{ $eq: ["$result", "CONNECTED"] }, 1, 0] } } } },
    ]),
    FollowUp.aggregate([
      { $match: { user: { $in: ids }, scheduledAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: "$user",
          done: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } },
          missed: { $sum: { $cond: [{ $or: [{ $eq: ["$status", "MISSED"] }, { $and: [{ $eq: ["$status", "PENDING"] }, { $lt: ["$scheduledAt", new Date()] }] }] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const byId = (arr: any[]) => new Map(arr.map((x) => [String(x._id), x]));
  const L = byId(leadStats);
  const C = byId(callStats);
  const F = byId(followStats);

  const team = people
    .map((p) => {
      const l = L.get(String(p._id)) || {};
      const c = C.get(String(p._id)) || {};
      const f = F.get(String(p._id)) || {};
      const assigned = l.assigned || 0;
      return {
        userId: String(p._id),
        name: p.name,
        email: p.email,
        isActive: p.isActive,
        profilePhotoUrl: p.profilePhotoUrl,
        assigned,
        contacted: l.contacted || 0,
        won: l.won || 0,
        lost: l.lost || 0,
        dealValue: l.dealValue || 0,
        conversionRate: assigned ? Math.round(((l.won || 0) / assigned) * 1000) / 10 : 0,
        contactRate: assigned ? Math.round(((l.contacted || 0) / assigned) * 1000) / 10 : 0,
        avgResponseMinutes: l.responseMinutes != null ? Math.round(l.responseMinutes) : null,
        calls: c.calls || 0,
        connectedCalls: c.connected || 0,
        followupsDone: f.done || 0,
        followupsMissed: f.missed || 0,
      };
    })
    .sort((a, b) => b.won - a.won || b.conversionRate - a.conversionRate || b.calls - a.calls);

  res.json({ range: { from, to }, team });
});

export default r;
