import { Types } from "mongoose";
import { PushToken } from "../models/PushToken";
import { logger } from "../config/logger";

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
}

/**
 * Register or update an Expo Push Token for a user.
 */
export async function registerPushToken(params: {
  userId: string | Types.ObjectId;
  token: string;
  platform?: "ios" | "android" | "web";
  app?: "ADMIN" | "SALES" | "ALL";
  deviceName?: string;
}) {
  const { userId, token, platform = "android", app = "ALL", deviceName } = params;

  if (!token || typeof token !== "string") {
    throw new Error("Invalid push token");
  }

  const record = await PushToken.findOneAndUpdate(
    { user: userId, token },
    {
      $set: {
        platform,
        app,
        deviceName,
        isActive: true,
        lastUsedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  logger.info("[push] token registered", { userId: String(userId), platform, app });
  return record;
}

/**
 * Deactivate or remove a push token (e.g., on logout).
 */
export async function unregisterPushToken(userId: string | Types.ObjectId, token: string) {
  const result = await PushToken.deleteOne({ user: userId, token });
  logger.info("[push] token unregistered", { userId: String(userId), removed: result.deletedCount });
  return result;
}

/**
 * Send push notification to one or multiple users.
 */
export async function sendPushNotification(
  userIds: (string | Types.ObjectId)[] | string | Types.ObjectId,
  payload: PushPayload,
) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  if (!ids.length) return;

  const tokens = await PushToken.find({
    user: { $in: ids },
    isActive: true,
  }).lean();

  if (!tokens.length) {
    logger.debug("[push] no active push tokens found for users", { userCount: ids.length });
    return;
  }

  // Format messages for Expo Push API
  const messages = tokens
    .filter((t) => t.token && (t.token.startsWith("ExponentPushToken") || t.token.startsWith("ExpoPushToken") || t.token.length > 20))
    .map((t) => ({
      to: t.token,
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      sound: payload.sound !== null ? "default" : undefined,
      badge: payload.badge,
      priority: "high",
      channelId: payload.channelId || "leadflow_alerts",
    }));

  if (!messages.length) return;

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.warn("[push] expo push service returned non-200", { status: res.status, body: errText });
      return;
    }

    const json = (await res.json()) as { data?: Array<{ status: string; message?: string; details?: { error?: string } }> };
    
    // Check for unregistered devices to clean them up
    if (json.data && Array.isArray(json.data)) {
      for (let i = 0; i < json.data.length; i++) {
        const ticket = json.data[i];
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          const badToken = messages[i]?.to;
          if (badToken) {
            await PushToken.updateMany({ token: badToken }, { $set: { isActive: false } });
            logger.info("[push] marked dead token as inactive", { token: badToken });
          }
        }
      }
    }

    logger.info("[push] notifications dispatched successfully", {
      recipients: ids.length,
      sentTokens: messages.length,
      title: payload.title,
    });
  } catch (err: any) {
    logger.error("[push] failed to send expo push notification", {
      error: err?.message || String(err),
    });
  }
}
