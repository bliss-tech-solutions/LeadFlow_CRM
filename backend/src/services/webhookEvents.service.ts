import { WebhookEvent, IWebhookEvent } from "../models/WebhookEvent";
import { ingestMetaLead } from "./meta.service";
import { logger } from "../config/logger";

type Source = IWebhookEvent["source"];

/**
 * Split a Meta webhook body into one payload per leadgen change.
 * Meta may batch several entries/changes into a single delivery.
 */
export function splitMetaPayload(body: any): any[] {
  const entries = Array.isArray(body?.entry) ? body.entry : null;
  if (!entries) return [body];

  const out: any[] = [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      if (change?.field && change.field !== "leadgen") continue;
      out.push({ object: body.object, entry: [{ ...entry, changes: [change] }] });
    }
  }
  return out;
}

function describe(payload: any) {
  const value = payload?.entry?.[0]?.changes?.[0]?.value ?? {};
  return {
    leadgenId: value.leadgen_id ? String(value.leadgen_id) : undefined,
    pageId: value.page_id ? String(value.page_id) : undefined,
    formId: value.form_id ? String(value.form_id) : undefined,
  };
}

async function processEvent(eventId: string, io: any, opts: { fetchDetails?: boolean; source?: string }) {
  const event = await WebhookEvent.findByIdAndUpdate(eventId, { $inc: { attempts: 1 } }, { new: true });
  if (!event) throw new Error("Webhook event not found");
  try {
    const result = await ingestMetaLead(event.payload, io, opts);
    event.status = result.duplicate ? "DUPLICATE" : "PROCESSED";
    event.lead = result.lead?._id as any;
    event.error = undefined;
    event.processedAt = new Date();
    await event.save();
    return result;
  } catch (error: any) {
    event.status = "FAILED";
    event.error = String(error?.message || error).slice(0, 1000);
    await event.save();
    throw error;
  }
}

/** Persist the raw event, then ingest it. Throws if ingestion fails (so Meta retries). */
export async function recordAndIngest(
  source: Source,
  payload: any,
  io: any,
  opts: { fetchDetails?: boolean; source?: string } = {},
) {
  const event = await WebhookEvent.create({ source, payload, ...describe(payload) });
  return processEvent(event.id, io, opts);
}

/** Re-run a stored event (admin "replay" button / automatic retry). */
export async function replayWebhookEvent(eventId: string, io: any) {
  const event = await WebhookEvent.findById(eventId).select("source").lean();
  if (!event) throw new Error("Webhook event not found");
  return processEvent(eventId, io, {
    fetchDetails: event.source === "META",
    source: event.source === "LEADSYNC" ? "LEADSYNC" : "META",
  });
}

/** Automatic retry for recent failures (e.g. transient Graph API errors). Max 5 attempts. */
export async function retryFailedWebhookEvents(io: any) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const failed = await WebhookEvent.find({ status: "FAILED", attempts: { $lt: 5 }, createdAt: { $gte: since } })
    .sort({ createdAt: 1 })
    .limit(20)
    .select("_id")
    .lean();
  for (const e of failed) {
    try {
      await replayWebhookEvent(String(e._id), io);
    } catch (error: any) {
      logger.warn("[webhook] retry failed", { eventId: String(e._id), error: error?.message });
    }
  }
}
