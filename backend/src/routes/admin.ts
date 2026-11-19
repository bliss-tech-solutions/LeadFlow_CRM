import { Router } from "express";
import jwt from "jsonwebtoken";
import { auth, roles } from "../middleware/auth";
import { Lead } from "../models/Lead";
import { User } from "../models/User";
import { Business } from "../models/Business";
import { WebhookEvent } from "../models/WebhookEvent";
import { WhatsAppSession, WhatsAppMessage } from "../models/WhatsApp";
import { logAudit } from "../utils/activity";
import { env } from "../config/env";

const r = Router();

/**
 * GET /api/admin/health
 * Platform dashboard: ingestion volume, webhook failures, held / unassigned
 * backlog, WhatsApp connections and per-business activity.
 */
r.get("/health", auth, roles("ADMIN", "MANAGER"), async (_req, res) => {
  const now = Date.now();
  const d1 = new Date(now - 24 * 60 * 60 * 1000);
  const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const [leads24h, leads7d, bySource24h, webhook24h, held, unassigned, unmapped, waSessions, waSent24h, waFailed24h, perBusiness, activeUsers] =
    await Promise.all([
      Lead.countDocuments({ createdAt: { $gte: d1 } }),
      Lead.countDocuments({ createdAt: { $gte: d7 } }),
      Lead.aggregate([{ $match: { createdAt: { $gte: d1 } } }, { $group: { _id: "$source", count: { $sum: 1 } } }]),
      WebhookEvent.aggregate([{ $match: { createdAt: { $gte: d1 } } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      Lead.countDocuments({ deliveryStatus: "HELD" }),
      Lead.countDocuments({ deliveryStatus: "RELEASED", assignedTo: { $exists: false }, businessProject: { $ne: null }, status: "NEW" }),
      Lead.countDocuments({ $or: [{ businessProject: { $exists: false } }, { businessProject: null }] }),
      WhatsAppSession.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      WhatsAppMessage.countDocuments({ sentAt: { $gte: d1 } }),
      WhatsAppMessage.countDocuments({ status: "FAILED", updatedAt: { $gte: d1 } }),
      Lead.aggregate([
        { $match: { createdAt: { $gte: d7 }, business: { $ne: null } } },
        {
          $group: {
            _id: "$business",
            leads: { $sum: 1 },
            won: { $sum: { $cond: [{ $eq: ["$status", "WON"] }, 1, 0] } },
            uncontacted: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "NEW"] }, { $not: [{ $ifNull: ["$lastContactAt", false] }] }] }, 1, 0] } },
          },
        },
        { $sort: { leads: -1 } },
        { $limit: 15 },
        { $lookup: { from: "businesses", localField: "_id", foreignField: "_id", as: "b" } },
        { $project: { leads: 1, won: 1, uncontacted: 1, name: { $ifNull: [{ $arrayElemAt: ["$b.name", 0] }, "Unknown"] } } },
      ]),
      User.aggregate([{ $match: { isActive: true } }, { $group: { _id: "$role", count: { $sum: 1 } } }]),
    ]);

  const toMap = (arr: any[]) => Object.fromEntries(arr.map((x) => [x._id || "UNKNOWN", x.count]));
  const webhooks = toMap(webhook24h);

  res.json({
    leads: { last24h: leads24h, last7d: leads7d, bySource24h: toMap(bySource24h) },
    webhooks: {
      last24h: webhooks,
      failureRate: (() => {
        const total = Object.values(webhooks).reduce((a: number, b: any) => a + Number(b), 0);
        return total ? Math.round(((Number(webhooks.FAILED || 0)) / total) * 1000) / 10 : 0;
      })(),
    },
    backlog: { held, unassigned, unmapped },
    whatsapp: { enabled: env.WA_ENABLED, sessions: toMap(waSessions), sent24h: waSent24h, failed24h: waFailed24h },
    perBusiness,
    users: toMap(activeUsers),
    businesses: {
      active: await Business.countDocuments({ isActive: true }),
      inactive: await Business.countDocuments({ isActive: false }),
    },
  });
});

/**
 * POST /api/admin/impersonate/:userId
 * "View as" a business owner or salesperson for support. Issues a 30-minute
 * token, never for another admin, and records it in the audit log.
 */
r.post("/impersonate/:userId", auth, roles("ADMIN"), async (req, res) => {
  const target = await User.findById(req.params.userId);
  if (!target || !target.isActive) return res.status(404).json({ message: "Active user not found" });
  if (target.role === "ADMIN" || target.role === "MANAGER") {
    return res.status(403).json({ message: "You cannot impersonate another administrator" });
  }

  const token = jwt.sign(
    {
      id: target.id,
      name: target.name,
      email: target.email,
      role: target.role,
      business: target.business ? String(target.business) : undefined,
      assignedProjects: (target.assignedProjects || []).map(String),
      businessProject: target.businessProject ? String(target.businessProject) : undefined,
      tv: Number(target.tokenVersion || 0),
      impersonatedBy: req.user!.id,
    },
    env.JWT_SECRET,
    { expiresIn: "30m" },
  );

  await logAudit({
    actor: req.user!.id,
    action: "USER_IMPERSONATED",
    entity: "User",
    entityId: target.id,
    after: { targetEmail: target.email, targetRole: target.role },
    ip: req.ip,
  });

  res.json({
    token,
    user: {
      id: target.id,
      name: target.name,
      email: target.email,
      role: target.role,
      business: target.business ? String(target.business) : undefined,
      assignedProjects: (target.assignedProjects || []).map(String),
      businessProject: target.businessProject ? String(target.businessProject) : undefined,
      profilePhotoUrl: target.profilePhotoUrl || null,
      impersonatedBy: req.user!.name,
    },
    expiresInMinutes: 30,
  });
});

export default r;
