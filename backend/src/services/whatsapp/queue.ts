import { WhatsAppMessage } from "../../models/WhatsApp";
import { Lead } from "../../models/Lead";
import { whatsappManager } from "./sessionManager";
import { createDocumentDownloadUrl } from "../s3.service";
import { logActivity } from "../../utils/activity";
import { emitLeadEvent } from "../../sockets";
import { logger } from "../../config/logger";
import { env } from "../../config/env";

const nextAllowedAt = new Map<string, number>();
let running = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randomGap = () => env.WA_MIN_GAP_MS + Math.floor(Math.random() * Math.max(0, env.WA_MAX_GAP_MS - env.WA_MIN_GAP_MS));

function startOfTodayIST() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return new Date(`${today}T00:00:00+05:30`);
}

/** Messages already sent (or in flight) today for a business — used for the daily safety cap. */
export async function sentTodayCount(businessId: string) {
  return WhatsAppMessage.countDocuments({
    business: businessId,
    status: { $in: ["SENDING", "SENT", "DELIVERED", "READ"] },
    createdAt: { $gte: startOfTodayIST() },
  });
}

async function emitUpdate(io: any, msg: any) {
  const lead: any = await Lead.findById(msg.lead).select("assignedTo business").lean();
  emitLeadEvent(
    io,
    "whatsapp_message",
    { messageId: String(msg._id), leadId: String(msg.lead), status: msg.status, error: msg.error },
    { assignedTo: lead?.assignedTo, business: lead?.business || msg.business },
  );
}

async function deliver(io: any, msg: any) {
  const businessId = String(msg.business);
  const jid = await whatsappManager.resolveJid(businessId, msg.to);
  if (!jid) {
    msg.status = "FAILED";
    msg.error = "This number is not on WhatsApp";
    await msg.save();
    return;
  }

  const ids: string[] = [];
  if (msg.body?.trim()) {
    const id = await whatsappManager.sendText(businessId, jid, msg.body);
    if (id) ids.push(id);
  }

  for (const doc of msg.documents || []) {
    await sleep(1200 + Math.floor(Math.random() * 1800));
    const url = doc.storageKey ? await createDocumentDownloadUrl(doc.storageKey) : doc.url;
    if (!url) continue;
    const id = await whatsappManager.sendDocument(businessId, jid, {
      url,
      fileName: doc.name || "document.pdf",
      mimetype: doc.mimeType || "application/pdf",
    });
    if (id) ids.push(id);
  }

  msg.status = "SENT";
  msg.waMessageIds = ids;
  msg.sentAt = new Date();
  msg.error = undefined;
  await msg.save();

  await Lead.updateOne(
    { _id: msg.lead },
    { $set: { lastWhatsAppAt: new Date(), lastContactAt: new Date() } },
  );
  await logActivity({
    lead: String(msg.lead),
    actor: String(msg.sentBy),
    type: "WHATSAPP_SENT",
    title: "WhatsApp sent",
    description: `${msg.body ? msg.body.slice(0, 120) : "Documents"}${msg.documents?.length ? ` · ${msg.documents.length} document(s)` : ""}`,
  });
}

/**
 * Sends at most one queued message per connected business per tick, with a
 * randomized human-like gap between messages and a per-number daily cap.
 */
export async function processWhatsAppQueue(io: any) {
  if (running || !env.WA_ENABLED) return;
  running = true;
  try {
    // Expire messages that waited more than 24h (e.g. WhatsApp never reconnected).
    const expired = await WhatsAppMessage.updateMany(
      { status: "QUEUED", createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60_000) } },
      { $set: { status: "FAILED", error: "Expired: WhatsApp was not connected within 24 hours" } },
    );
    if (expired.modifiedCount) logger.warn("[whatsapp] expired queued messages", { count: expired.modifiedCount });

    for (const businessId of whatsappManager.connectedBusinessIds()) {
      if ((nextAllowedAt.get(businessId) || 0) > Date.now()) continue;
      if ((await sentTodayCount(businessId)) >= env.WA_DAILY_LIMIT) continue;

      const msg = await WhatsAppMessage.findOneAndUpdate(
        {
          business: businessId,
          status: "QUEUED",
          $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: new Date() } }],
        },
        { $set: { status: "SENDING" }, $inc: { attempts: 1 } },
        { sort: { createdAt: 1 }, new: true },
      );
      if (!msg) continue;

      nextAllowedAt.set(businessId, Date.now() + randomGap());
      await emitUpdate(io, msg);

      try {
        await deliver(io, msg);
      } catch (error: any) {
        const message = String(error?.message || error).slice(0, 300);
        if (msg.attempts < 3 && whatsappManager.isConnected(businessId)) {
          msg.status = "QUEUED";
          msg.nextAttemptAt = new Date(Date.now() + 30_000 * msg.attempts);
          msg.error = `Retrying: ${message}`;
        } else {
          msg.status = whatsappManager.isConnected(businessId) ? "FAILED" : "QUEUED";
          msg.error = message;
        }
        await msg.save();
        logger.warn("[whatsapp] send failed", { businessId, messageId: msg.id, error: message });
      }
      await emitUpdate(io, msg);
    }
  } catch (error: any) {
    logger.error("[whatsapp] queue tick failed", { error: error?.message });
  } finally {
    running = false;
  }
}
