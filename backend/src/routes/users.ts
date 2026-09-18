import { Router } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { auth, roles } from "../middleware/auth";

const r = Router();


/**
 * GET /api/users
 * List active users for admin/manager team management.
 */
r.get("/", auth, roles("ADMIN"), async (_req, res) => {
  const users = await User.find({ isActive: true })
    .select("-passwordHash")
    .sort({ name: 1 });

  res.json({ users });
});


/**
 * POST /api/users
 * Admin creates a salesperson account.
 */
r.post("/", auth, roles("ADMIN"), async (req, res) => {
  const { name, email, password } = req.body ?? {};

  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({
      message: "Name, email and password are required",
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      message: "Password must be at least 8 characters",
    });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });

  if (existing) {
    return res.status(409).json({ message: "Email is already registered" });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role: "SALES",
    isActive: true,
    dailyLeadLimit: 5,
  });

  res.status(201).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    },
  });
});


/**
 * PATCH /api/users/:id/capacity
 * Admin changes the automatic daily lead capacity for a salesperson.
 */
r.patch("/:id/capacity", auth, roles("ADMIN"), async (req, res) => {
  const limit = Number(req.body?.dailyLeadLimit);

  if (!Number.isFinite(limit) || limit < 0 || limit > 1000) {
    return res.status(400).json({ message: "Daily lead limit must be between 0 and 1000" });
  }

  const user = await User.findOneAndUpdate(
    { _id: req.params.id, role: "SALES" },
    { $set: { dailyLeadLimit: Math.floor(limit) } },
    { new: true },
  ).select("-passwordHash");

  if (!user) return res.status(404).json({ message: "Salesperson not found" });

  res.json({ user });
});

export default r;
