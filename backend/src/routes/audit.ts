import { Router } from "express";
import { Types } from "mongoose";
import { Audit } from "../models/Audit";
import { auth, roles } from "../middleware/auth";
import { containsRegex } from "../utils/regex";

const r = Router();

/**
 * GET /api/audit
 * Admin audit trail with filters: actor, entity, action (contains), date range.
 */
r.get("/", auth, roles("ADMIN", "MANAGER"), async (req, res) => {
  const { actor, entity, action, from, to, page = "1", limit = "25" } = req.query as Record<string, string>;
  const q: Record<string, unknown> = {};
  if (actor && Types.ObjectId.isValid(actor)) q.actor = actor;
  if (entity) q.entity = String(entity).slice(0, 40);
  if (action) q.action = containsRegex(action);
  const created: Record<string, Date> = {};
  if (from && !Number.isNaN(Date.parse(from))) created.$gte = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    created.$lte = end;
  }
  if (Object.keys(created).length) q.createdAt = created;

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 25));

  const [audit, total, entities] = await Promise.all([
    Audit.find(q)
      .populate("actor", "name email role")
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    Audit.countDocuments(q),
    Audit.distinct("entity"),
  ]);

  res.json({ audit, total, page: p, pages: Math.max(1, Math.ceil(total / l)), entities });
});

export default r;
