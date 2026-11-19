import { Router } from "express";
import crypto from "crypto";
import { env } from "../config/env";
import { auth, roles } from "../middleware/auth";
import { webhookLimiter } from "../middleware/rateLimits";
import { logger } from "../config/logger";
import { WebhookEvent } from "../models/WebhookEvent";
import { recordAndIngest, replayWebhookEvent, splitMetaPayload } from "../services/webhookEvents.service";
import { logAudit } from "../utils/activity";

const r = Router();

/**
 * GET /api/meta/webhook
 * Verify the Meta webhook subscription challenge.
 */
r.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.META_VERIFY_TOKEN && typeof challenge === "string") {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

function verifySignature(rawBody: Buffer | undefined, signature: unknown) {
  if (!env.META_APP_SECRET) return true; // production refuses to boot without a secret (config/env.ts)
  if (typeof signature !== "string" || !rawBody) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", env.META_APP_SECRET).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * POST /api/meta/webhook
 * Receive Meta leadgen events. Every change in a (possibly batched) delivery is
 * stored in the webhook event log, then ingested. Failures are kept as FAILED
 * events and retried automatically, so we acknowledge Meta with 200 once stored.
 */
r.post("/webhook", webhookLimiter, async (req, res) => {
  if (!verifySignature(req.rawBody, req.headers["x-hub-signature-256"])) {
    return res.sendStatus(401);
  }

  const io = req.app.get("io");
  const payloads = splitMetaPayload(req.body);
  const results: { leadId?: string; duplicate?: boolean; error?: string }[] = [];

  for (const payload of payloads) {
    try {
      const result = await recordAndIngest("META", payload, io, { fetchDetails: true });
      results.push({ leadId: result.lead?.id, duplicate: result.duplicate });
    } catch (error: any) {
      logger.error("[meta] webhook event failed (stored for retry)", { error: error?.message });
      results.push({ error: "stored-for-retry" });
    }
  }

  return res.status(200).json({ received: true, events: results.length, results });
});

/**
 * POST /api/meta/test-lead
 * Creates a local Meta-style test lead without calling Meta Graph API.
 */
r.post("/test-lead", auth, roles("ADMIN"), async (req, res) => {
  try {
    const io = req.app.get("io");
    const body = req.body ?? {};
    const testLeadgenId = body.leadgen_id || body.leadgenId || `TEST-${Date.now()}`;
    const name = String(body.name || "Demo Meta Lead").slice(0, 120);
    const email = String(body.email || "lead@example.com").slice(0, 160);
    const phone = String(body.phone || "+91 98765 00000").slice(0, 30);

    const payload = {
      entry: [
        {
          id: body.page_id || "TEST_PAGE",
          changes: [
            {
              field: "leadgen",
              value: {
                leadgen_id: testLeadgenId,
                page_id: body.page_id || "TEST_PAGE",
                ad_id: body.ad_id || "TEST_AD",
                form_id: body.form_id || "TEST_FORM",
                adgroup_id: body.adgroup_id || "TEST_ADSET",
                created_time: Math.floor(Date.now() / 1000),
                name,
                email,
                phone,
                campaign_name: body.campaign || "Demo Campaign",
                form_name: body.form_name || "Demo Lead Form",
                field_data: [
                  { name: "full_name", values: [name] },
                  { name: "email", values: [email] },
                  { name: "phone_number", values: [phone] },
                ],
              },
            },
          ],
        },
      ],
    };

    const result = await recordAndIngest("TEST", payload, io, { fetchDetails: false });
    return res.status(result.duplicate ? 200 : 201).json({
      success: true,
      duplicate: result.duplicate,
      lead: result.lead,
    });
  } catch (error: any) {
    logger.error("[meta] test lead failed", { error: error?.message });
    return res.status(500).json({ success: false, message: error?.message || "Failed to create test lead" });
  }
});

/**
 * GET /api/meta/events
 * Admin webhook log with status filter and summary counts (last 24h).
 */
r.get("/events", auth, roles("ADMIN", "MANAGER"), async (req, res) => {
  const { status, source, page = "1", limit = "20" } = req.query as Record<string, string>;
  const q: Record<string, unknown> = {};
  if (status && ["RECEIVED", "PROCESSED", "DUPLICATE", "FAILED"].includes(status)) q.status = status;
  if (source && ["META", "LEADSYNC", "TEST"].includes(source)) q.source = source;

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [events, total, summary] = await Promise.all([
    WebhookEvent.find(q)
      .select("-payload")
      .populate("lead", "name status")
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    WebhookEvent.countDocuments(q),
    WebhookEvent.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  res.json({
    events,
    total,
    page: p,
    pages: Math.max(1, Math.ceil(total / l)),
    last24h: Object.fromEntries(summary.map((s: any) => [s._id, s.count])),
  });
});

/** GET /api/meta/events/:id — includes the raw payload for debugging. */
r.get("/events/:id", auth, roles("ADMIN"), async (req, res) => {
  const event = await WebhookEvent.findById(req.params.id).populate("lead", "name status").lean();
  if (!event) return res.status(404).json({ message: "Event not found" });
  res.json({ event });
});

/** POST /api/meta/events/:id/replay */
r.post("/events/:id/replay", auth, roles("ADMIN"), async (req, res) => {
  try {
    const result = await replayWebhookEvent(String(req.params.id), req.app.get("io"));
    await logAudit({
      actor: req.user!.id,
      action: "WEBHOOK_REPLAYED",
      entity: "WebhookEvent",
      entityId: String(req.params.id),
      after: { leadId: result.lead?.id, duplicate: result.duplicate },
      ip: req.ip,
    });
    res.json({ success: true, duplicate: result.duplicate, leadId: result.lead?.id });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error?.message || "Replay failed" });
  }
});

export default r;
