import { Router } from "express";
import { Types } from "mongoose";
import { Notification } from "../models/Notification";
import { User } from "../models/User";
import { auth } from "../middleware/auth";
import { validateBody, objectId, z } from "../middleware/validate";
import { registerPushToken, unregisterPushToken, sendPushNotification } from "../services/push.service";

const r = Router();

/**
 * GET /api/notifications?cursor=<id>&limit=30&unread=true
 * Current user's notifications, newest first, with cursor pagination for mobile infinite scroll.
 */
r.get("/", auth, async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const q: Record<string, unknown> = { user: req.user!.id, type: { $ne: "LEAD_ASSIGNED" } };
  if (req.query.unread === "true") q.readAt = null;
  const cursor = String(req.query.cursor || "");
  if (cursor && Types.ObjectId.isValid(cursor)) q._id = { $lt: new Types.ObjectId(cursor) };

  const [notifications, unreadCount] = await Promise.all([
    Notification.find(q).sort({ _id: -1 }).limit(limit + 1).lean(),
    Notification.countDocuments({ user: req.user!.id, type: { $ne: "LEAD_ASSIGNED" }, readAt: null }),
  ]);
  const hasMore = notifications.length > limit;
  const page = hasMore ? notifications.slice(0, limit) : notifications;
  res.json({ notifications: page, unreadCount, nextCursor: hasMore ? String(page[page.length - 1]._id) : null });
});

/** PATCH /api/notifications/read-all */
r.patch("/read-all", auth, async (req, res) => {
  await Notification.updateMany({ user: req.user!.id, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ success: true });
});

/** PATCH /api/notifications/read — mark several as read: { ids: [] } */
r.patch("/read", auth, validateBody(z.object({ ids: z.array(objectId).min(1).max(200) })), async (req, res) => {
  const result = await Notification.updateMany(
    { _id: { $in: req.body.ids }, user: req.user!.id, readAt: null },
    { $set: { readAt: new Date() } },
  );
  res.json({ updated: result.modifiedCount });
});

/** PATCH /api/notifications/:id/read */
r.patch("/:id/read", auth, async (req, res) => {
  if (!Types.ObjectId.isValid(String(req.params.id))) return res.status(400).json({ message: "Invalid id" });
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user!.id },
    { readAt: new Date() },
    { new: true },
  );
  if (!notification) return res.status(404).json({ message: "Notification not found" });
  res.json({ notification });
});

/** DELETE /api/notifications/clear-read */
r.delete("/clear-read", auth, async (req, res) => {
  await Notification.deleteMany({ user: req.user!.id, readAt: { $ne: null } });
  res.json({ success: true });
});

/* ------------------------------------------------------------------ */
/* Push devices & preferences                                          */
/* ------------------------------------------------------------------ */

const pushTokenSchema = z.object({
  token: z.string().min(10).max(200),
  platform: z.enum(["ios", "android"]).default("android"),
  deviceName: z.string().trim().max(120).optional(),
});

/**
 * POST /api/notifications/push-token
 * Register the device's Expo push token. The app is derived from the signed-in
 * token (never trusted from the body) so admin pushes only reach the Admin app.
 */
r.post("/push-token", auth, validateBody(pushTokenSchema), async (req, res) => {
  const app = req.user!.app === "admin-app" ? "ADMIN" : req.user!.app === "partner-app" ? "PARTNER" : null;
  if (!app) return res.status(400).json({ message: "Push notifications are only available in the mobile apps" });
  try {
    await registerPushToken({ userId: req.user!.id, token: req.body.token, platform: req.body.platform, app, deviceName: req.body.deviceName });
    res.json({ success: true });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ message: error.message || "Could not register device" });
  }
});

/** DELETE /api/notifications/push-token — on logout. */
r.delete("/push-token", auth, async (req, res) => {
  const token = String(req.body?.token || req.query.token || "");
  if (!token) return res.status(400).json({ message: "Token is required" });
  await unregisterPushToken(req.user!.id, token);
  res.json({ success: true });
});

/** POST /api/notifications/test-push — send a test push to the caller's devices. */
r.post("/test-push", auth, async (req, res) => {
  await sendPushNotification(req.user!.id, {
    title: "LeadFlow notifications are on ✅",
    body: `Hi ${req.user!.name?.split(" ")[0] || "there"}, you'll get new leads and reminders here.`,
    channelId: "system",
    data: { type: "TEST", path: "/notifications" },
  });
  res.json({ success: true, message: "Test notification sent" });
});

const PREF_KEYS = ["newLead", "assignment", "followup", "sla", "mention", "whatsapp", "activity", "system"] as const;

/** GET /api/notifications/preferences */
r.get("/preferences", auth, async (req, res) => {
  const u: any = await User.findById(req.user!.id).select("notificationPrefs").lean();
  const prefs = Object.fromEntries(PREF_KEYS.map((k) => [k, u?.notificationPrefs?.[k] ?? k !== "activity"]));
  res.json({ preferences: prefs });
});

/** PATCH /api/notifications/preferences — { newLead: false, ... } */
r.patch(
  "/preferences",
  auth,
  validateBody(z.object(Object.fromEntries(PREF_KEYS.map((k) => [k, z.boolean().optional()]))).strict()),
  async (req, res) => {
    const $set = Object.fromEntries(Object.entries(req.body).filter(([, v]) => v !== undefined).map(([k, v]) => [`notificationPrefs.${k}`, v]));
    const u: any = await User.findByIdAndUpdate(req.user!.id, { $set }, { new: true }).select("notificationPrefs").lean();
    res.json({ preferences: u?.notificationPrefs || {} });
  },
);

/** DELETE /api/notifications/:id */
r.delete("/:id", auth, async (req, res) => {
  if (!Types.ObjectId.isValid(String(req.params.id))) return res.status(400).json({ message: "Invalid id" });
  const result = await Notification.deleteOne({ _id: req.params.id, user: req.user!.id });
  if (!result.deletedCount) return res.status(404).json({ message: "Notification not found" });
  res.json({ success: true });
});

export default r;
