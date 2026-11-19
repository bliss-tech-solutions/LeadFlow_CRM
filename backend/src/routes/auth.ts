import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { User } from "../models/User";
import { appUrl } from "../config/env";
import { auth, signUserToken, isAdminRole } from "../middleware/auth";
import { loginLimiter, passwordResetLimiter } from "../middleware/rateLimits";
import { validateBody, z } from "../middleware/validate";
import { invalidateUser } from "../utils/userCache";
import { logAudit } from "../utils/activity";
import { sendMail } from "../services/mail.service";
import { disconnectUserSockets } from "../sockets";

const r = Router();

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long");

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required").max(128),
  portal: z.enum(["ADMIN", "SALES", "BUSINESS"]).default("ADMIN"),
});

/**
 * POST /api/auth/login
 * Authenticate an admin/manager, salesperson, or business partner portal.
 */
r.post("/login", loginLimiter, validateBody(loginSchema), async (req, res) => {
  const { email, password, portal } = req.body as z.infer<typeof loginSchema>;

  const u = await User.findOne({ email });

  // Same response for unknown email / wrong password / blocked to avoid account enumeration.
  if (!u || !u.isActive || !(await bcrypt.compare(password, u.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  if (portal === "BUSINESS" && u.role !== "BUSINESS") {
    return res.status(403).json({ message: "This account is not a business partner account" });
  }
  if (portal === "SALES" && u.role !== "SALES") {
    return res.status(403).json({ message: "This account is not a salesperson account" });
  }
  if (portal === "ADMIN" && !["ADMIN", "MANAGER"].includes(u.role)) {
    return res.status(403).json({ message: "This account cannot access the admin portal" });
  }

  u.lastLoginAt = new Date();
  await u.save();

  const token = signUserToken({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    business: u.business,
    assignedProjects: u.assignedProjects,
    businessProject: u.businessProject,
    tokenVersion: u.tokenVersion,
  });

  res.json({
    token,
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      business: u.business ? String(u.business) : undefined,
      assignedProjects: (u.assignedProjects || []).map(String),
      businessProject: u.businessProject ? String(u.businessProject) : undefined,
      profilePhotoUrl: u.profilePhotoUrl || null,
    },
  });
});

/**
 * GET /api/auth/me
 */
r.get("/me", auth, async (req, res) => {
  const businessFields = isAdminRole(req.user?.role)
    ? "name contactNo leadLimit leadLimitType detail"
    : "name contactNo detail";
  const user = await User.findById(req.user!.id)
    .select("name email role isActive profilePhotoUrl business businessProject assignedProjects lastLoginAt")
    .populate("business", businessFields)
    .populate("assignedProjects", "name stage location reraNumber")
    .populate("businessProject", "name stage developerGroup reraNumber")
    .lean();
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user });
});

/**
 * POST /api/auth/change-password
 * Change own password. Revokes every other session by bumping tokenVersion.
 */
r.post(
  "/change-password",
  auth,
  validateBody(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema })),
  async (req, res) => {
    const u = await User.findById(req.user!.id);
    if (!u) return res.status(404).json({ message: "User not found" });
    if (!(await bcrypt.compare(req.body.currentPassword, u.passwordHash))) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }
    u.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    u.tokenVersion = Number(u.tokenVersion || 0) + 1;
    await u.save();
    invalidateUser(u.id);

    await logAudit({ actor: u.id, action: "PASSWORD_CHANGED", entity: "User", entityId: u.id, ip: req.ip });

    const token = signUserToken({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      business: u.business,
      assignedProjects: u.assignedProjects,
      businessProject: u.businessProject,
      tokenVersion: u.tokenVersion,
    });
    res.json({ message: "Password updated. Other devices have been signed out.", token });
  },
);

/**
 * POST /api/auth/logout-all
 * Revoke every issued token for the current user.
 */
r.post("/logout-all", auth, async (req, res) => {
  await User.updateOne({ _id: req.user!.id }, { $inc: { tokenVersion: 1 } });
  invalidateUser(req.user!.id);
  disconnectUserSockets(req.app.get("io"), req.user!.id);
  await logAudit({ actor: req.user!.id, action: "LOGOUT_ALL", entity: "User", entityId: req.user!.id, ip: req.ip });
  res.json({ message: "Signed out from all devices." });
});

/**
 * POST /api/auth/forgot-password
 * Always responds 200 so the endpoint cannot be used to discover accounts.
 */
r.post(
  "/forgot-password",
  passwordResetLimiter,
  validateBody(z.object({ email: z.string().trim().toLowerCase().email() })),
  async (req, res) => {
    const generic = { message: "If an account exists for this email, a reset link has been sent." };
    const u = await User.findOne({ email: req.body.email, isActive: true });
    if (!u) return res.json(generic);

    const rawToken = crypto.randomBytes(32).toString("hex");
    u.resetTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    u.resetTokenExpires = new Date(Date.now() + 30 * 60_000);
    await u.save();

    const link = `${appUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(u.email)}`;
    try {
      await sendMail({
        to: u.email,
        subject: "Reset your LeadFlow CRM password",
        text: `Hi ${u.name},\n\nUse the link below to set a new password. It expires in 30 minutes.\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
      });
    } catch {
      // Swallow delivery errors so the response stays uniform.
    }
    res.json(generic);
  },
);

/**
 * POST /api/auth/reset-password
 */
r.post(
  "/reset-password",
  passwordResetLimiter,
  validateBody(
    z.object({
      email: z.string().trim().toLowerCase().email(),
      token: z.string().regex(/^[a-f0-9]{64}$/, "Invalid reset link"),
      password: passwordSchema,
    }),
  ),
  async (req, res) => {
    const tokenHash = crypto.createHash("sha256").update(req.body.token).digest("hex");
    const u = await User.findOne({
      email: req.body.email,
      resetTokenHash: tokenHash,
      resetTokenExpires: { $gt: new Date() },
    }).select("+resetTokenHash +resetTokenExpires");

    if (!u) {
      return res.status(400).json({ message: "This reset link is invalid or has expired." });
    }

    u.passwordHash = await bcrypt.hash(req.body.password, 12);
    u.resetTokenHash = undefined;
    u.resetTokenExpires = undefined;
    u.tokenVersion = Number(u.tokenVersion || 0) + 1;
    await u.save();
    invalidateUser(u.id);

    await logAudit({ actor: u.id, action: "PASSWORD_RESET", entity: "User", entityId: u.id, ip: req.ip });
    res.json({ message: "Password updated. You can now sign in." });
  },
);

export default r;
