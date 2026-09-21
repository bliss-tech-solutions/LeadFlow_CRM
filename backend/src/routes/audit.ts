import { Router } from "express";
import { Audit } from "../models/Audit";
import { auth, roles } from "../middleware/auth";

const r = Router();

/**
 * GET /api/audit
 * Admin/manager audit trail.
 */
r.get("/", auth, roles("ADMIN"), async (_req, res) => {
  const audit = await Audit.find()
    .populate("actor", "name email role")
    .sort({ createdAt: -1 })
    .limit(100);

  res.json({ audit });
});

export default r;
