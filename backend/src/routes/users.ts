import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import { auth, roles } from "../middleware/auth";
import { Notification } from "../models/Notification";
import { logAudit } from "../utils/activity";
import { Lead } from "../models/Lead";
import { env } from "../config/env";
import crypto from "crypto";
import { createDocumentUploadUrl, createPublicObjectUrl, deleteDocumentObject } from "../services/s3.service";

const r = Router();

/**
 * GET /api/users
 * List active users for admin/manager team management.
 */
r.get("/", auth, roles("ADMIN", "MANAGER"), async (_req, res) => {
  const users = await User.find({ isActive: true })
    .select("-passwordHash")
    .sort({ name: 1 })
    .lean();

  const counts = await Lead.aggregate([
    {
      $match: {
        deliveryStatus: "RELEASED",
        assignedTo: { $exists: true },
      },
    },
    { $group: { _id: "$assignedTo", count: { $sum: 1 } } },
  ]);

  const countMap = new Map(counts.map((item: any) => [String(item._id), Number(item.count || 0)]));
  res.json({
    users: users.map((user: any) => ({
      ...user,
      assignedLeadCount: countMap.get(String(user._id)) || 0,
    })),
  });
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
r.patch("/:id/capacity", auth, roles("ADMIN", "MANAGER"), async (req, res) => {
  const limit = Number(req.body?.dailyLeadLimit);

  if (!Number.isFinite(limit) || limit < 0 || limit > 1000) {
    return res
      .status(400)
      .json({ message: "Daily lead limit must be between 0 and 1000" });
  }

  const before = await User.findOne({ _id: req.params.id, role: "SALES" }).select(
    "name email dailyLeadLimit",
  );

  const user = await User.findOneAndUpdate(
    { _id: req.params.id, role: "SALES" },
    { $set: { dailyLeadLimit: Math.floor(limit) } },
    { new: true },
  ).select("-passwordHash");

  if (!user) return res.status(404).json({ message: "Salesperson not found" });

  await Notification.create({
    user: user._id,
    type: "DAILY_LEAD_LIMIT_CHANGED",
    title: "Daily lead limit updated",
    message: `Your daily automatic lead limit is now ${user.dailyLeadLimit} leads.`,
    entityType: "User",
    entityId: user.id,
  });

  await logAudit({
    actor: req.user!.id,
    action: "DAILY_LEAD_LIMIT_CHANGED",
    entity: "User",
    entityId: user.id,
    before: { dailyLeadLimit: before?.dailyLeadLimit },
    after: { dailyLeadLimit: user.dailyLeadLimit },
    ip: req.ip,
  });

  const io = req.app.get("io");
  if (io) {
    io.to(`user:${user.id}`).emit("capacity_updated", {
      userId: user.id,
      dailyLeadLimit: user.dailyLeadLimit,
    });
    io.to("role:ADMIN").emit("capacity_updated", {
      userId: user.id,
      dailyLeadLimit: user.dailyLeadLimit,
    });
  }

  res.json({ user });
});


/**
 * GET /api/users/me
 * Return the current user's editable profile.
 */
r.get("/me", auth, async (req, res) => {
  const user = await User.findById(req.user!.id).select("name email role isActive dailyLeadLimit profilePhotoUrl");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user });
});

/**
 * PATCH /api/users/me
 * Users may update their display name; email is intentionally immutable here.
 */
r.patch("/me", auth, async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ message: "Name is required" });
  if (name.length > 100) return res.status(400).json({ message: "Name is too long" });

  const before = await User.findById(req.user!.id).select("name email");
  const user = await User.findByIdAndUpdate(
    req.user!.id,
    { $set: { name } },
    { new: true },
  ).select("name email role isActive dailyLeadLimit profilePhotoUrl");

  if (!user) return res.status(404).json({ message: "User not found" });

  await logAudit({
    actor: req.user!.id,
    action: "PROFILE_UPDATED",
    entity: "User",
    entityId: user.id,
    before: before?.toObject(),
    after: { name: user.name, email: user.email },
    ip: req.ip,
  });

  const token = jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as any },
  );

  res.json({ user, token });
});


/**
 * POST /api/users/me/profile-photo/upload-url
 * Return a presigned S3 PUT URL for the current user's profile photo.
 */
r.post("/me/profile-photo/upload-url", auth, async (req, res) => {
  const contentType = String(req.body?.contentType || "").toLowerCase();
  const size = Number(req.body?.size || 0);
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);

  if (!allowed.has(contentType)) {
    return res.status(400).json({ message: "Profile photo must be JPG, PNG or WEBP." });
  }
  if (!Number.isFinite(size) || size <= 0 || size > 5 * 1024 * 1024) {
    return res.status(400).json({ message: "Profile photo must be smaller than 5 MB." });
  }

  const extension = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
  const key = `profiles/${req.user!.id}/${crypto.randomUUID()}.${extension}`;

  try {
    const uploadUrl = await createDocumentUploadUrl(key, contentType);
    res.json({ uploadUrl, key, url: createPublicObjectUrl(key) });
  } catch (error: any) {
    res.status(503).json({ message: error?.message || "S3 is not configured." });
  }
});

/**
 * PATCH /api/users/me/profile-photo
 * Save the uploaded S3 object and remove the previous object when replacing it.
 */
r.patch("/me/profile-photo", auth, async (req, res) => {
  const key = String(req.body?.key || "").trim();
  if (!key || !key.startsWith(`profiles/${req.user!.id}/`)) {
    return res.status(400).json({ message: "Invalid profile photo key." });
  }

  const current = await User.findById(req.user!.id).select("profilePhotoKey");
  if (!current) return res.status(404).json({ message: "User not found" });

  const oldKey = current.profilePhotoKey;
  const url = createPublicObjectUrl(key);
  current.profilePhotoKey = key;
  current.profilePhotoUrl = url;
  await current.save();

  if (oldKey && oldKey !== key) {
    try { await deleteDocumentObject(oldKey); } catch {}
  }

  res.json({ user: { id: current.id, profilePhotoUrl: url } });
});

/**
 * DELETE /api/users/me/profile-photo
 * Remove the current profile photo from S3 and MongoDB.
 */
r.delete("/me/profile-photo", auth, async (req, res) => {
  const current = await User.findById(req.user!.id).select("profilePhotoKey");
  if (!current) return res.status(404).json({ message: "User not found" });

  const oldKey = current.profilePhotoKey;
  current.profilePhotoKey = undefined;
  current.profilePhotoUrl = undefined;
  await current.save();

  if (oldKey) {
    try { await deleteDocumentObject(oldKey); } catch {}
  }

  res.json({ user: { id: current.id, profilePhotoUrl: null } });
});

export default r;
