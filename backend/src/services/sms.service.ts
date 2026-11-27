import { env } from "../config/env";
import { logger } from "../config/logger";
import { OutreachSettings } from "../models/Outreach";
import { decryptString } from "../utils/crypto";

/**
 * MSG91 Flow API (https://docs.msg91.com).
 * In India the message text must match a DLT-approved template, so the text itself
 * lives in MSG91; we only send the template id and the variable values per number.
 * Use ##name## / ##first_name## in the MSG91 template to fill them in.
 */

type SmsCredentials = { authKey: string; senderId?: string; webhookToken?: string; source: "dashboard" | "env" | "none" };

let cached: { at: number; value: SmsCredentials } | null = null;

/**
 * Credentials saved from the dashboard win; server env vars are the fallback.
 * Cached briefly so bulk sends and webhooks don't hit the database every time.
 */
export async function getSmsCredentials(): Promise<SmsCredentials> {
  if (cached && Date.now() - cached.at < 30_000) return cached.value;
  let value: SmsCredentials = { authKey: env.MSG91_AUTH_KEY || "", webhookToken: env.SMS_WEBHOOK_TOKEN, source: env.MSG91_AUTH_KEY ? "env" : "none" };
  try {
    const s: any = await OutreachSettings.findOne({ key: "sms" }).lean();
    if (s?.authKeyEnc) {
      value = { authKey: decryptString(s.authKeyEnc), senderId: s.senderId || undefined, webhookToken: s.webhookToken || env.SMS_WEBHOOK_TOKEN, source: "dashboard" };
    } else if (s?.webhookToken) value.webhookToken = s.webhookToken;
    if (s?.senderId && value.source !== "dashboard") value.senderId = s.senderId;
  } catch (e: any) {
    logger.warn("[sms] could not read SMS settings", { error: e?.message });
  }
  cached = { at: Date.now(), value };
  return value;
}

export function clearSmsCredentialsCache() {
  cached = null;
}

export async function isSmsConfigured() {
  return Boolean((await getSmsCredentials()).authKey);
}

export type SmsRecipient = { mobile: string; vars: Record<string, string> };

/** Send one Flow request for up to 100 numbers. Returns MSG91's request id. */
export async function sendSmsFlow(templateId: string, recipients: SmsRecipient[], override?: { authKey?: string; senderId?: string }): Promise<string> {
  const creds = await getSmsCredentials();
  const authKey = override?.authKey || creds.authKey;
  const senderId = override?.senderId || creds.senderId;
  if (!authKey) throw new Error("SMS gateway is not set up yet");
  if (!recipients.length) throw new Error("No recipients");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(env.MSG91_API_URL, {
      method: "POST",
      headers: { authkey: authKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        template_id: templateId,
        short_url: "0",
        ...(senderId ? { sender: senderId } : {}),
        recipients: recipients.map((r) => ({ mobiles: r.mobile, ...r.vars })),
      }),
      signal: controller.signal,
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || data?.type === "error") {
      throw new Error(String(data?.message || `MSG91 returned HTTP ${res.status}`).slice(0, 300));
    }
    return String(data?.message || data?.request_id || "");
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("SMS gateway timed out");
    logger.warn("[sms] MSG91 send failed", { error: e?.message });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export type DeliveryReport = { requestId: string; number: string; delivered: boolean; failed: boolean; description: string };

const FAILED_CODES = new Set(["2", "9", "16", "17", "25", "26"]);

/**
 * MSG91 posts delivery reports as JSON, or as a form field `data` holding JSON.
 * Shape: [{ requestId, report: [{ number, status, desc }] }]. Parsed defensively.
 */
export function parseDeliveryReports(body: any): DeliveryReport[] {
  let data = body?.data ?? body;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return [];
    }
  }
  const items: any[] = Array.isArray(data) ? data : [data];
  const out: DeliveryReport[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const requestId = String(item.requestId ?? item.request_id ?? item.requestID ?? "");
    const reports: any[] = Array.isArray(item.report) ? item.report : [item];
    for (const r of reports) {
      const number = String(r.number ?? r.telNum ?? r.mobile ?? r.mobiles ?? "").replace(/\D/g, "");
      const code = String(r.status ?? "");
      const description = String(r.desc ?? r.description ?? r.statusDesc ?? "").toUpperCase();
      const delivered = code === "1" || description.includes("DELIVERED");
      const failed = !delivered && (FAILED_CODES.has(code) || /FAIL|REJECT|NDNC|BLOCK|INVALID/.test(description));
      if (requestId && number) out.push({ requestId, number, delivered, failed, description: description || code });
    }
  }
  return out;
}
