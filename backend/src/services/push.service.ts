import { Types } from "mongoose";
type ExpoSdk = typeof import("expo-server-sdk", { with: { "resolution-mode": "import" } });
type ExpoPushMessage = import("expo-server-sdk", { with: { "resolution-mode": "import" } }).ExpoPushMessage;
type ExpoPushTicket = import("expo-server-sdk", { with: { "resolution-mode": "import" } }).ExpoPushTicket;
import { PushToken } from "../models/PushToken";
import { User } from "../models/User";
import { logger } from "../config/logger";

// expo-server-sdk is ESM-only; the API compiles to CommonJS, so load it lazily.
let sdk: Promise<{ Expo: ExpoSdk["Expo"]; client: InstanceType<ExpoSdk["Expo"]> }> | null = null;
function getExpo() {
  if (!sdk) {
    sdk = import("expo-server-sdk").then((m) => ({
      Expo: m.Expo,
      client: new m.Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN || undefined }),
    }));
  }
  return sdk;
}

/** Expo push tokens look like ExponentPushToken[xxxx] / ExpoPushToken[xxxx]. */
export function isExpoPushToken(token: unknown) {
  return typeof token === "string" && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}

export type PushCategory = "newLead" | "assignment" | "followup" | "sla" | "mention" | "whatsapp" | "activity" | "system";

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  /** Android notification channel (created by the apps): leads | reminders | system */
  channelId?: string;
  category?: PushCategory;
  /** iOS: time-sensitive alerts break through Focus modes. */
  timeSensitive?: boolean;
}

/** Map a notification `type` to a user-controllable category and an Android channel. */
export function categorize(type: string): { category: PushCategory; channelId: string; timeSensitive: boolean } {
  const t = String(type || "").toUpperCase();
  if (t === "NEW_LEAD" || t === "HELD_LEAD_RELEASED") return { category: "newLead", channelId: "leads", timeSensitive: true };
  if (t.startsWith("LEAD_ASSIGNED") || t === "LEAD_REASSIGNED") return { category: "assignment", channelId: "leads", timeSensitive: true };
  if (t.startsWith("FOLLOWUP")) return { category: "followup", channelId: "reminders", timeSensitive: true };
  if (t.startsWith("SLA")) return { category: "sla", channelId: "reminders", timeSensitive: true };
  if (t === "MENTION") return { category: "mention", channelId: "leads", timeSensitive: false };
  if (t.startsWith("WHATSAPP")) return { category: "whatsapp", channelId: "system", timeSensitive: false };
  if (t === "CALL_LOGGED") return { category: "activity", channelId: "system", timeSensitive: false };
  return { category: "system", channelId: "system", timeSensitive: false };
}

/**
 * Register or update an Expo push token for a user. A token belongs to exactly
 * one user — if another account signs in on the same phone, it moves.
 */
export async function registerPushToken(params: {
  userId: string | Types.ObjectId;
  token: string;
  platform?: "ios" | "android" | "web";
  app?: "ADMIN" | "PARTNER" | "SALES" | "ALL";
  deviceName?: string;
}) {
  const { userId, token, platform = "android", app = "ALL", deviceName } = params;
  if (!token || typeof token !== "string" || !isExpoPushToken(token)) {
    throw Object.assign(new Error("Invalid Expo push token"), { statusCode: 400 });
  }

  await PushToken.deleteMany({ token, user: { $ne: userId } });
  const record = await PushToken.findOneAndUpdate(
    { user: userId, token },
    { $set: { platform, app, deviceName, isActive: true, lastUsedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  logger.info("[push] token registered", { userId: String(userId), platform, app });
  return record;
}

export async function unregisterPushToken(userId: string | Types.ObjectId, token: string) {
  return PushToken.deleteOne({ user: userId, token });
}

/** Tickets waiting for a delivery receipt: receiptId -> token. */
const pendingReceipts = new Map<string, string>();

/**
 * Send a push to one or many users, honouring each user's notification preferences
 * and only targeting the app that matches the user's role.
 */
export async function sendPushNotification(
  userIds: (string | Types.ObjectId)[] | string | Types.ObjectId,
  payload: PushPayload,
) {
  const ids = (Array.isArray(userIds) ? userIds : [userIds]).map(String);
  if (!ids.length) return;

  const users = await User.find({ _id: { $in: ids }, isActive: true }).select("_id role notificationPrefs").lean();
  const allowed = users.filter((u: any) => {
    if (!payload.category) return true;
    const prefs = u.notificationPrefs || {};
    const value = prefs[payload.category];
    return value === undefined ? payload.category !== "activity" : Boolean(value);
  });
  if (!allowed.length) return;

  const appFor = (role: string) => (role === "ADMIN" || role === "MANAGER" ? ["ADMIN", "ALL"] : ["PARTNER", "SALES", "ALL"]);
  const tokens: { token: string }[] = [];
  for (const u of allowed as any[]) {
    const docs = await PushToken.find({ user: u._id, isActive: true, app: { $in: appFor(u.role) } }).select("token").lean();
    tokens.push(...docs);
  }

  const messages: ExpoPushMessage[] = tokens
    .filter((t) => isExpoPushToken(t.token))
    .map((t) => ({
      to: t.token,
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      sound: payload.sound === null ? null : "default",
      badge: payload.badge,
      priority: "high",
      channelId: payload.channelId || "leads",
      ...(payload.timeSensitive ? { interruptionLevel: "time-sensitive" as const } : {}),
    }));
  if (!messages.length) return;

  const { client } = await getExpo();
  for (const chunk of client.chunkPushNotifications(messages)) {
    try {
      const tickets: ExpoPushTicket[] = await client.sendPushNotificationsAsync(chunk);
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        const token = String(chunk[i]?.to);
        if (ticket.status === "ok") pendingReceipts.set(ticket.id, token);
        else if (ticket.details?.error === "DeviceNotRegistered") {
          await PushToken.updateMany({ token }, { $set: { isActive: false } });
        }
      }
    } catch (error: any) {
      logger.error("[push] send failed", { error: error?.message });
    }
  }
}

/**
 * Check delivery receipts (Expo makes them available ~15 min after sending)
 * and disable tokens of uninstalled apps. Run every 15 minutes.
 */
export async function processPushReceipts() {
  if (!pendingReceipts.size) return;
  const ids = [...pendingReceipts.keys()];
  const { client } = await getExpo();
  for (const chunk of client.chunkPushNotificationReceiptIds(ids)) {
    try {
      const receipts = await client.getPushNotificationReceiptsAsync(chunk);
      for (const [id, receipt] of Object.entries(receipts)) {
        const token = pendingReceipts.get(id);
        pendingReceipts.delete(id);
        if (receipt.status === "error") {
          if (receipt.details?.error === "DeviceNotRegistered" && token) {
            await PushToken.updateMany({ token }, { $set: { isActive: false } });
          } else {
            logger.warn("[push] delivery error", { error: receipt.details?.error, message: receipt.message });
          }
        }
      }
    } catch (error: any) {
      logger.warn("[push] receipt check failed", { error: error?.message });
    }
  }
  // Never let the map grow unbounded if receipts are unavailable.
  if (pendingReceipts.size > 50_000) pendingReceipts.clear();
}

/**
 * Called for every stored Notification (see models/Notification.ts hook):
 * turns in-app notifications into phone pushes with a deep link.
 */
export async function pushForNotifications(docs: { user: unknown; type: string; title: string; message: string; entityType?: string; entityId?: string }[]) {
  // Group identical notifications so one push call fans out to many users.
  const groups = new Map<string, { users: string[]; doc: (typeof docs)[number] }>();
  for (const d of docs) {
    const key = `${d.type}|${d.title}|${d.message}|${d.entityType}|${d.entityId}`;
    const g = groups.get(key) || { users: [], doc: d };
    g.users.push(String(d.user));
    groups.set(key, g);
  }
  for (const { users, doc } of groups.values()) {
    const { category, channelId, timeSensitive } = categorize(doc.type);
    const path =
      doc.entityType === "Lead" && doc.entityId
        ? `/leads/${doc.entityId}`
        : doc.type.startsWith("WHATSAPP")
          ? "/whatsapp"
          : doc.type === "UNASSIGNED_LEADS"
            ? "/leads"
            : "/notifications";
    await sendPushNotification(users, {
      title: doc.title,
      body: doc.message,
      category,
      channelId,
      timeSensitive,
      data: { type: doc.type, entityType: doc.entityType, entityId: doc.entityId, path },
    });
  }
}
