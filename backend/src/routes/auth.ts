import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { User } from "../models/User";
import { appUrl } from "../config/env";
import { auth, signUserToken, isAdminRole, APP_ROLES } from "../middleware/auth";
import { Session, revokeUserSessions } from "../models/Session";
import { PushToken } from "../models/PushToken";
import { loginLimiter, passwordResetLimiter, refreshLimiter } from "../middleware/rateLimits";
import { validateBody, z } from "../middleware/validate";
import { invalidateUser } from "../utils/userCache";
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
  /** Mobile apps identify themselves; the website omits this. */
  client: z.enum(["web", "admin-app", "partner-app"]).default("web"),
  device: z
    .object({
      name: z.string().trim().max(120).optional(),
      platform: z.enum(["ios", "android"]).optional(),
      appVersion: z.string().trim().max(20).optional(),
    })
    .optional(),
});

type ClientApp = "admin-app" | "partner-app";
const APP_ACCESS_TTL = "15m";
const REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000;

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

function publicUser(u: any) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    business: u.business ? String(u.business) : undefined,
    assignedProjects: (u.assignedProjects || []).map(String),
    businessProject: u.businessProject ? String(u.businessProject) : undefined,
    profilePhotoUrl: u.profilePhotoUrl || null,
  };
}

/** Create a device session and return a fresh access + refresh token pair. */
async function issueAppTokens(u: any, app: ClientApp, req: any, device?: { name?: string; platform?: string; appVersion?: string }) {
  const refreshToken = crypto.randomBytes(48).toString("base64url");
  const session = await Session.create({
    user: u._id,
    app,
    refreshTokenHash: hashToken(refreshToken),
    tokenVersion: Number(u.tokenVersion || 0),
    deviceName: device?.name,
    platform: device?.platform,
    appVersion: device?.appVersion,
    ip: req.ip,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  const token = signUserToken(
    { id: u.id, name: u.name, email: u.email, role: u.role, business: u.business, assignedProjects: u.assignedProjects, businessProject: u.businessProject, tokenVersion: u.tokenVersion },
    { app, sessionId: session.id, expiresIn: APP_ACCESS_TTL },
  );
  return { token, refreshToken, expiresIn: 15 * 60, sessionId: session.id };
}

/**
 * POST /api/auth/login
 * Authenticate an admin/manager, salesperson, or business partner portal.
 * Mobile apps pass `client` and receive a short-lived access token + rotating refresh token.
 */
r.post("/login", loginLimiter, validateBody(loginSchema), async (req, res) => {
  const { email, password, portal, client, device } = req.body as z.infer<typeof loginSchema>;

  const u = await User.findOne({ email });

  // Same response for unknown email / wrong password / blocked to avoid account enumeration.
  if (!u || !u.isActive || !(await bcrypt.compare(password, u.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  if (client !== "web") {
    // Each mobile app serves a fixed set of roles; the other app's users are refused.
    if (!APP_ROLES[client].includes(u.role)) {
      return res.status(403).json({
        code: "WRONG_APP",
        message:
          client === "admin-app"
            ? "This account is not an admin account. Please use the LeadFlow Partner app."
            : "Admin accounts sign in with the LeadFlow Admin app.",
      });
    }
    u.lastLoginAt = new Date();
    await u.save();
    const tokens = await issueAppTokens(u, client, req, device);
    return res.json({ ...tokens, user: publicUser(u) });
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
 * POST /api/auth/refresh
 * Exchange a refresh token for a new access + refresh pair (rotation).
 * Re-using an already-rotated token revokes the whole session (token theft).
 */
r.post(
  "/refresh",
  refreshLimiter,
  validateBody(z.object({ refreshToken: z.string().min(20).max(200), appVersion: z.string().max(20).optional() })),
  async (req, res) => {
    const hash = hashToken(req.body.refreshToken);
    const session = await Session.findOne({ refreshTokenHash: hash });

    if (!session) {
      const stolen = await Session.findOne({ previousHashes: hash });
      if (stolen && !stolen.revokedAt) {
        stolen.revokedAt = new Date();
        stolen.revokedReason = "refresh-token-reuse";
        await stolen.save();
      }
      return res.status(401).json({ code: "SESSION_INVALID", message: "Please sign in again." });
    }
    if (session.revokedAt || session.expiresAt < new Date()) {
      return res.status(401).json({ code: "SESSION_INVALID", message: "Please sign in again." });
    }

    const u = await User.findById(session.user);
    if (!u || !u.isActive || Number(u.tokenVersion || 0) !== session.tokenVersion || !APP_ROLES[session.app].includes(u.role)) {
      session.revokedAt = new Date();
      session.revokedReason = "user-changed";
      await session.save();
      return res.status(401).json({ code: "SESSION_INVALID", message: "Please sign in again." });
    }

    const refreshToken = crypto.randomBytes(48).toString("base64url");
    session.previousHashes = [...session.previousHashes.slice(-9), session.refreshTokenHash];
    session.refreshTokenHash = hashToken(refreshToken);
    session.lastUsedAt = new Date();
    session.expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    if (req.body.appVersion) session.appVersion = req.body.appVersion;
    session.ip = req.ip;
    await session.save();

    const token = signUserToken(
      { id: u.id, name: u.name, email: u.email, role: u.role, business: u.business, assignedProjects: u.assignedProjects, businessProject: u.businessProject, tokenVersion: u.tokenVersion },
      { app: session.app, sessionId: session.id, expiresIn: APP_ACCESS_TTL },
    );
    res.json({ token, refreshToken, expiresIn: 15 * 60, user: publicUser(u) });
  },
);

/**
 * POST /api/auth/logout
 * Sign this device out: revoke its session and remove its push token.
 */
r.post("/logout", auth, async (req, res) => {
  const sid = req.user!.sessionId;
  if (req.body?.refreshToken) {
    await Session.updateOne(
      { refreshTokenHash: hashToken(String(req.body.refreshToken)), user: req.user!.id },
      { $set: { revokedAt: new Date(), revokedReason: "logout" } },
    );
  } else if (sid) {
    await Session.updateOne({ _id: sid, user: req.user!.id }, { $set: { revokedAt: new Date(), revokedReason: "logout" } });
  }
  if (req.body?.pushToken) await PushToken.deleteOne({ user: req.user!.id, token: String(req.body.pushToken) });
  res.json({ success: true });
});

/** GET /api/auth/sessions — signed-in mobile devices. */
r.get("/sessions", auth, async (req, res) => {
  const sessions = await Session.find({ user: req.user!.id, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } })
    .select("app deviceName platform appVersion lastUsedAt createdAt")
    .sort({ lastUsedAt: -1 })
    .lean();
  res.json({ sessions, currentSessionId: req.user!.sessionId || null });
});

/** DELETE /api/auth/sessions/:id — sign out one device. */
r.delete("/sessions/:id", auth, async (req, res) => {
  const result = await Session.updateOne(
    { _id: req.params.id, user: req.user!.id, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokedReason: "removed-by-user" } },
  );
  if (!result.modifiedCount) return res.status(404).json({ message: "Device not found" });
  res.json({ success: true });
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

    await revokeUserSessions(u.id, "password-changed");

    if (req.user!.app) {
      // Keep this device signed in with a brand-new session.
      const tokens = await issueAppTokens(u, req.user!.app, req);
      return res.json({ message: "Password updated. Other devices have been signed out.", ...tokens });
    }

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
  await revokeUserSessions(req.user!.id, "logout-all");
  await PushToken.updateMany({ user: req.user!.id }, { $set: { isActive: false } });
  disconnectUserSockets(req.app.get("io"), req.user!.id);
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
    await revokeUserSessions(u.id, "password-reset");

    res.json({ message: "Password updated. You can now sign in." });
  },
);

export default r;
