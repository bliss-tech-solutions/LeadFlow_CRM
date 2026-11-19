import { Router } from "express";
import { Notification } from "../models/Notification";
import { auth } from "../middleware/auth";
import { registerPushToken, unregisterPushToken, sendPushNotification } from "../services/push.service";

const r = Router();

/**
 * GET /api/notifications
 * Return the current user's latest notifications.
 */
r.get("/", auth, async (req, res) => {
  const notifications = await Notification.find({ user: req.user!.id, type: { $ne: "LEAD_ASSIGNED" } })
    .sort({ createdAt: -1 })
    .limit(50);

  const unreadCount = await Notification.countDocuments({
    user: req.user!.id,
    type: { $ne: "LEAD_ASSIGNED" },
    readAt: null,
  });

  res.json({ notifications, unreadCount });
});

/**
 * PATCH /api/notifications/read-all
 * Mark all current-user notifications as read.
 */
r.patch("/read-all", auth, async (req, res) => {
  await Notification.updateMany(
    { user: req.user!.id, readAt: null },
    { $set: { readAt: new Date() } },
  );

  res.json({ success: true });
});

/**
 * PATCH /api/notifications/:id/read
 * Mark one notification as read.
 */
r.patch("/:id/read", auth, async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user!.id },
    { readAt: new Date() },
    { new: true },
  );

  if (!notification) {
    return res.status(404).json({ message: "Notification not found" });
  }

  res.json({ notification });
});

/**
 * DELETE /api/notifications/clear-read
 * Delete all read notifications for the current user.
 */
r.delete("/clear-read", auth, async (req, res) => {
  await Notification.deleteMany({
    user: req.user!.id,
    readAt: { $ne: null },
  });

  res.json({ success: true });
});

/**
 * DELETE /api/notifications/:id
 * Delete one notification owned by the current user.
 */
r.delete("/:id", auth, async (req, res) => {
  const result = await Notification.deleteOne({
    _id: req.params.id,
    user: req.user!.id,
  });

  if (!result.deletedCount) {
    return res.status(404).json({ message: "Notification not found" });
  }

  res.json({ success: true });
});

/**
 * POST /api/notifications/push-token
 * Register or update an Expo Push Token for mobile alerts.
 */
r.post("/push-token", auth, async (req, res) => {
  const { token, platform, app, deviceName } = req.body || {};
  if (!token) {
    return res.status(400).json({ message: "Push token is required" });
  }

  await registerPushToken({
    userId: req.user!.id,
    token,
    platform: platform === "ios" || platform === "android" ? platform : "android",
    app: app === "ADMIN" || app === "SALES" ? app : "ALL",
    deviceName,
  });

  res.json({ success: true, message: "Push token registered successfully" });
});

/**
 * DELETE /api/notifications/push-token
 * Unregister push token when user logs out.
 */
r.delete("/push-token", auth, async (req, res) => {
  const { token } = req.body || {};
  if (!token) {
    return res.status(400).json({ message: "Token is required" });
  }

  await unregisterPushToken(req.user!.id, token);
  res.json({ success: true });
});

/**
 * POST /api/notifications/test-push
 * Trigger an instant test push notification to the current user's devices.
 */
r.post("/test-push", auth, async (req, res) => {
  await sendPushNotification(req.user!.id, {
    title: "LeadFlow CRM Alert",
    body: `Hello ${req.user!.name || "there"}, push notifications are active for your device!`,
    data: { test: true, timestamp: Date.now() },
  });

  res.json({ success: true, message: "Test notification dispatched" });
});

export default r;
