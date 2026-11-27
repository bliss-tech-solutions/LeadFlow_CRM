import { OutreachMessage, OutreachSettings, OUTREACH_WA_ID } from "../models/Outreach";
import { whatsappManager } from "./whatsapp/sessionManager";
import { logger } from "../config/logger";
import { env } from "../config/env";

/**
 * Send queue for LeadFlow's own outreach WhatsApp number (Contact Data page).
 * Completely separate from business numbers: own session, own queue (the
 * OutreachMessage rows), own daily limit. One message per tick with a random,
 * human-like gap, so the number isn't flagged for bulk sending.
 */

let running = false;
let nextAllowedAt = 0;

const randomGap = () => env.WA_MIN_GAP_MS + Math.floor(Math.random() * Math.max(0, env.WA_MAX_GAP_MS - env.WA_MIN_GAP_MS));

export function startOfTodayIST() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return new Date(`${today}T00:00:00+05:30`);
}

export async function outreachWaDailyLimit() {
  const s: any = await OutreachSettings.findOne({ key: "whatsapp" }).select("dailyLimit").lean();
  return Number(s?.dailyLimit) || env.WA_DAILY_LIMIT;
}

export function outreachWaSentToday() {
  return OutreachMessage.countDocuments({
    channel: "WHATSAPP",
    status: { $in: ["SENDING", "SENT", "DELIVERED", "READ"] },
    sentAt: { $gte: startOfTodayIST() },
  });
}

function emit(io: any) {
  io?.to("role:ADMIN").emit("outreach_updated", {});
}

export async function processOutreachWhatsApp(io: any) {
  if (running || !env.WA_ENABLED || !whatsappManager.isConnected(OUTREACH_WA_ID)) return;
  if (nextAllowedAt > Date.now()) return;
  running = true;
  try {
    if ((await outreachWaSentToday()) >= (await outreachWaDailyLimit())) return;

    const msg = await OutreachMessage.findOneAndUpdate(
      {
        channel: "WHATSAPP",
        status: "QUEUED",
        $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: null }, { nextAttemptAt: { $lte: new Date() } }],
      },
      { $set: { status: "SENDING", sentAt: new Date() }, $inc: { attempts: 1 } },
      { sort: { createdAt: 1 }, new: true },
    );
    if (!msg) return;
    nextAllowedAt = Date.now() + randomGap();

    try {
      const jid = await whatsappManager.resolveJid(OUTREACH_WA_ID, msg.to);
      if (!jid) {
        msg.status = "FAILED";
        msg.error = "This number is not on WhatsApp";
      } else {
        const id = await whatsappManager.sendText(OUTREACH_WA_ID, jid, msg.body);
        msg.status = "SENT";
        msg.waMessageIds = id ? [id] : [];
        msg.sentAt = new Date();
        msg.error = undefined;
      }
    } catch (error: any) {
      const message = String(error?.message || error).slice(0, 300);
      const connected = whatsappManager.isConnected(OUTREACH_WA_ID);
      if (msg.attempts < 3 && connected) {
        msg.status = "QUEUED";
        msg.nextAttemptAt = new Date(Date.now() + 30_000 * msg.attempts);
        msg.error = `Retrying: ${message}`;
      } else {
        msg.status = connected ? "FAILED" : "QUEUED";
        msg.error = message;
      }
      logger.warn("[outreach-wa] send failed", { messageId: msg.id, error: message });
    }
    await msg.save();
    emit(io);
  } catch (error: any) {
    logger.error("[outreach-wa] queue tick failed", { error: error?.message });
  } finally {
    running = false;
  }
}
