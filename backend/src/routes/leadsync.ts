import { Router } from "express";
import { timingSafeEqual } from "crypto";
import { env } from "../config/env";
import { recordAndIngest } from "../services/webhookEvents.service";
import { webhookLimiter } from "../middleware/rateLimits";
import { logger } from "../config/logger";
import { auth, roles } from "../middleware/auth";

const r = Router();

const SYSTEM_AND_CONSTANT_KEYS = new Set([
  // Contact constants (handled separately)
  "full_name",
  "name",
  "first_name",
  "last_name",
  "email",
  "phone_number",
  "phone",
  "contact",
  "phone_no",
  "mobile",
  "mobile_number",

  // Metadata / System IDs
  "lead_id",
  "leadgen_id",
  "id",
  "page_id",
  "page_name",
  "form_id",
  "form_name",
  "ad_id",
  "ad_name",
  "adset_id",
  "ad_set_id",
  "adset_name",
  "ad_set_name",
  "adgroup_id",
  "campaign_id",
  "campaign_name",
  "campaign",
  "ad_account_id",
  "ad_account_name",
  "account_id",
  "created_at",
  "created_time",
  "platform",
  "is_organic",
  "retailer_item_id",
  "form_data",
  "raw_body",
]);

// Helper to safely get string values that aren't empty, null, or template placeholders
function getCleanString(val: any): string | undefined {
  if (val === undefined || val === null) return undefined;
  const str = String(val).trim();
  if (!str || str.startsWith("{{") || str.toLowerCase() === "null") return undefined;
  return str;
}

// POST /api/leadsync/webhook
r.post("/webhook", webhookLimiter, async (req, res) => {
  try {
    const secret = env.LEADSYNC_WEBHOOK_SECRET;

    if (!secret) {
      return res.status(503).json({ received: false, message: "LeadSync webhook is not configured" });
    }

    const supplied = req.header("x-leadsync-secret") ?? "";

    const expectedBuffer = Buffer.from(secret);
    const suppliedBuffer = Buffer.from(supplied);
    if (
      suppliedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(suppliedBuffer, expectedBuffer)
    ) {
      return res.status(401).json({ received: false, message: "Invalid webhook secret" });
    }

    const body = req.body ?? {};

    const formData = body.form_data && typeof body.form_data === "object" ? body.form_data : {};

    const leadId =
      getCleanString(body.lead_id) ??
      getCleanString(body.id) ??
      getCleanString(body.leadgen_id) ??
      getCleanString(formData.leadgen_id) ??
      getCleanString(formData.lead_id) ??
      "";

    if (!leadId) {
      return res.status(400).json({
        received: false,
        message: "Missing unique lead_id (or id) in LeadSync payload",
      });
    }

    const name =
      getCleanString(body.name) ??
      getCleanString(body.full_name) ??
      getCleanString(formData.full_name) ??
      getCleanString(formData.name) ??
      "LeadSync Lead";

    const email =
      getCleanString(body.email) ??
      getCleanString(formData.email) ??
      undefined;

    const phone =
      getCleanString(body.phone) ??
      getCleanString(body.phone_number) ??
      getCleanString(formData.phone_number) ??
      getCleanString(formData.phone) ??
      undefined;

    const pageId =
      getCleanString(body.page_id) ??
      getCleanString(formData.page_id) ??
      undefined;

    const pageName =
      getCleanString(body.page_name) ??
      getCleanString(formData.page_name) ??
      undefined;

    const formId =
      getCleanString(body.form_id) ??
      getCleanString(formData.form_id) ??
      undefined;

    const formName =
      getCleanString(body.form_name) ??
      getCleanString(formData.form_name) ??
      undefined;

    const adId =
      getCleanString(body.ad_id) ??
      getCleanString(formData.ad_id) ??
      undefined;

    const adSetId =
      getCleanString(body.ad_set_id) ??
      getCleanString(body.adset_id) ??
      getCleanString(formData.adset_id) ??
      getCleanString(formData.ad_set_id) ??
      getCleanString(formData.adgroup_id) ??
      undefined;

    const campaignName =
      getCleanString(body.campaign_name) ??
      getCleanString(body.campaign) ??
      getCleanString(formData.campaign_name) ??
      undefined;

    const campaignId =
      getCleanString(body.campaign_id) ??
      getCleanString(formData.campaign_id) ??
      undefined;

    const rawCreatedTime =
      body.created_time ??
      formData.created_time ??
      formData.created_at ??
      undefined;

    // Collect flexible form fields (from form_data and top-level body)
    const flexibleFormData: Record<string, string> = {};
    const flexibleFieldList: Array<{ name: string; values: string[] }> = [];

    // Prioritize formData entries, then body entries
    const sourcesToCheck = [formData, body];
    for (const source of sourcesToCheck) {
      if (!source || typeof source !== "object") continue;
      for (const [rawKey, rawVal] of Object.entries(source)) {
        const lowerKey = rawKey.trim().toLowerCase();
        if (SYSTEM_AND_CONSTANT_KEYS.has(lowerKey)) continue;
        if (rawVal === undefined || rawVal === null) continue;

        let strVal = "";
        if (Array.isArray(rawVal)) {
          strVal = rawVal
            .filter((v) => v !== null && v !== undefined)
            .map(String)
            .join(", ")
            .trim();
        } else if (typeof rawVal === "object") {
          strVal = JSON.stringify(rawVal);
        } else {
          strVal = String(rawVal).trim();
        }

        // Do not include empty string data, null, or template placeholders
        if (!strVal || strVal.startsWith("{{") || strVal.toLowerCase() === "null") continue;

        if (!(rawKey in flexibleFormData)) {
          flexibleFormData[rawKey] = strVal;
          flexibleFieldList.push({ name: rawKey, values: [strVal] });
        }
      }
    }

    // Include contact fields in field_data for full compatibility
    const contactFields = [
      ["full_name", name],
      ["email", email],
      ["phone_number", phone],
    ]
      .filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== null && String(entry[1]).trim() !== "")
      .map(([k, v]) => ({ name: k, values: [String(v)] }));

    const allFieldData = [...contactFields, ...flexibleFieldList];

    const payload = {
      entry: [
        {
          id: String(pageId ?? "LEADSYNC"),
          changes: [
            {
              field: "leadgen",
              value: {
                leadgen_id: leadId,
                page_id: pageId,
                page_name: pageName,
                form_id: formId,
                form_name: formName,
                ad_id: adId,
                adgroup_id: adSetId,
                ad_set_id: adSetId,
                campaign_id: campaignId,
                campaign_name: campaignName,
                created_time: rawCreatedTime,
                name,
                email,
                phone,
                field_data: allFieldData,
                form_data: flexibleFormData,
                raw_body: body,
              },
            },
          ],
        },
      ],
    };

    const io = req.app.get("io");
    const result = await recordAndIngest("LEADSYNC", payload, io, {
      fetchDetails: false,
      source: "LEADSYNC",
    });

    return res.status(result.duplicate ? 200 : 201).json({
      received: true,
      duplicate: result.duplicate,
      leadId: result.lead.id,
    });
  } catch (error) {
    logger.error("[leadsync] webhook processing failed", { error: (error as any)?.message });
    return res.status(500).json({ received: false, message: "LeadSync webhook processing failed" });
  }
});

/**
 * POST /api/leadsync/test-lead
 * Test LeadSync ingestion format directly from admin dashboard.
 */
r.post("/test-lead", auth, roles("ADMIN"), async (req, res) => {
  try {
    const io = req.app.get("io");
    const body = req.body ?? {};
    const leadId = String(body.lead_id || body.id || body.leadgen_id || `LEADSYNC-TEST-${Date.now()}`).trim();
    const name = String(body.name || body.full_name || "Demo LeadSync Lead").slice(0, 120);
    const email = body.email ? String(body.email).slice(0, 160) : undefined;
    const phone = body.phone || body.phone_number ? String(body.phone || body.phone_number).slice(0, 30) : "+91 98765 43210";
    const pageId = body.page_id || "LEADSYNC_PAGE";
    const pageName = body.page_name || "LeadSync Page";
    const formId = body.form_id || "LEADSYNC_FORM";
    const formName = body.form_name || "LeadSync Form";
    const campaignName = body.campaign_name || body.campaign || "LeadSync Campaign";
    const formData = body.form_data && typeof body.form_data === "object" ? body.form_data : {};

    const flexibleFormData: Record<string, string> = {};
    const flexibleFieldList: Array<{ name: string; values: string[] }> = [];
    for (const [k, v] of Object.entries(formData)) {
      if (v !== undefined && v !== null && String(v).trim()) {
        flexibleFormData[k] = String(v);
        flexibleFieldList.push({ name: k, values: [String(v)] });
      }
    }

    const contactFields = [
      ["full_name", name],
      ["email", email || ""],
      ["phone_number", phone],
    ]
      .filter((entry) => Boolean(entry[1]))
      .map(([k, v]) => ({ name: k, values: [String(v)] }));

    const allFieldData = [...contactFields, ...flexibleFieldList];

    const payload = {
      entry: [
        {
          id: String(pageId),
          changes: [
            {
              field: "leadgen",
              value: {
                leadgen_id: leadId,
                page_id: pageId,
                page_name: pageName,
                form_id: formId,
                form_name: formName,
                ad_id: body.ad_id || "TEST_AD",
                adgroup_id: body.adset_id || "TEST_ADSET",
                campaign_name: campaignName,
                created_time: Math.floor(Date.now() / 1000),
                name,
                email,
                phone,
                field_data: allFieldData,
                form_data: flexibleFormData,
                raw_body: body,
              },
            },
          ],
        },
      ],
    };

    const result = await recordAndIngest("LEADSYNC", payload, io, {
      fetchDetails: false,
      source: "LEADSYNC",
    });

    return res.status(result.duplicate ? 200 : 201).json({
      success: true,
      duplicate: result.duplicate,
      lead: result.lead,
    });
  } catch (error: any) {
    logger.error("[leadsync] test lead failed", { error: error?.message });
    return res.status(500).json({ success: false, message: error?.message || "Failed to create LeadSync test lead" });
  }
});

export default r;
