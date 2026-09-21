import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import { env } from "../config/env";
import { auth } from "../middleware/auth";

const r = Router();

/**
 * POST /api/auth/login
 * Authenticate an admin/manager or salesperson portal.
 */
r.post("/login", async (req, res) => {
  const { email, password, portal = "ADMIN" } = req.body ?? {};

  const u = await User.findOne({
    email: String(email ?? "")
      .trim()
      .toLowerCase(),
  });

  if (
    !u ||
    !u.isActive ||
    !(await bcrypt.compare(password ?? "", u.passwordHash))
  ) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  if (portal === "SALES" && u.role !== "SALES") {
    return res.status(403).json({
      message: "This account is not a salesperson account",
    });
  }

  if (portal === "ADMIN" && !["ADMIN", "MANAGER"].includes(u.role)) {
    return res.status(403).json({
      message: "Use the salesperson login for this account",
    });
  }

  const token = jwt.sign(
    {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as any },
  );

  res.json({
    token,
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
    },
  });
});

/**
 * GET /api/auth/me
 * Return the authenticated user when the route is protected by auth.
 */
r.get("/me", auth, (req, res) => {
  res.json({ user: req.user });
});

export default r;
