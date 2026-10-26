import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import { env } from "../config/env";
import { auth } from "../middleware/auth";

const r = Router();

/**
 * POST /api/auth/login
 * Authenticate an admin/manager, salesperson, or business partner portal.
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

  if (portal === "BUSINESS" && u.role !== "BUSINESS") {
    return res.status(403).json({
      message: "This account is not a business partner account",
    });
  }

  if (portal === "SALES" && u.role !== "SALES") {
    return res.status(403).json({
      message: "This account is not a salesperson account",
    });
  }

  if (portal === "ADMIN" && !["ADMIN", "MANAGER"].includes(u.role)) {
    return res.status(403).json({
      message: "This account cannot access the admin portal",
    });
  }

  if (u.role === "BUSINESS" && portal !== "BUSINESS") {
    return res.status(403).json({
      message: "Use the business partner login for this account",
    });
  }

  const token = jwt.sign(
    {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      business: u.business ? String(u.business) : undefined,
      assignedProjects: Array.isArray(u.assignedProjects) ? u.assignedProjects.map(String) : [],
      businessProject: u.businessProject ? String(u.businessProject) : undefined,
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
      business: u.business ? String(u.business) : undefined,
      assignedProjects: u.assignedProjects || [],
      businessProject: u.businessProject ? String(u.businessProject) : undefined,
      profilePhotoUrl: u.profilePhotoUrl || null,
    },
  });
});

/**
 * GET /api/auth/me
 * Return the authenticated user when the route is protected by auth.
 */
r.get("/me", auth, async (req, res) => {
  const user = await User.findById(req.user!.id)
    .select("name email role isActive profilePhotoUrl business businessProject assignedProjects")
    .populate("business", "name contactNo leadLimit leadLimitType detail")
    .populate("assignedProjects", "name stage location reraNumber")
    .populate("businessProject", "name stage developerGroup reraNumber")
    .lean();
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user });
});

export default r;
