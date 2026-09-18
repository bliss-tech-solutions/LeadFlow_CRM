import { Router } from "express";
import { Notification } from "../models/Notification";
import { auth } from "../middleware/auth";

const r = Router();


/**
 * GET /api/notifications
 * Return the current user's latest notifications.
 */
r.get("/", auth, async (req, res) => {
  const notifications = await Notification.find({ user: req.user!.id })
    .sort({ createdAt: -1 })
    .limit(50);

  const unreadCount = await Notification.countDocuments({
    user: req.user!.id,
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

export default r;
