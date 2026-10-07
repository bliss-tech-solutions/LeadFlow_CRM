import { Router } from "express";
import crypto from "crypto";
import { env } from "../config/env";
import { ingestMetaLead } from "../services/meta.service";
import { auth, roles } from "../middleware/auth";

const r = Router();

/**
 * GET /api/meta/webhook
 * Verify the Meta webhook subscription challenge.
 */
r.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === env.META_VERIFY_TOKEN &&
    typeof challenge === "string"
  ) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

/**
 * POST /api/meta/webhook
 * Receive Meta leadgen events and retrieve the complete lead record.
 */
r.post("/webhook", async (req, res) => {
  try {
    if (env.META_APP_SECRET) {
      const signature = req.headers["x-hub-signature-256"];

      if (typeof signature !== "string") {
        return res.sendStatus(401);
      }

      const expected =
        "sha256=" +
        crypto
          .createHmac("sha256", env.META_APP_SECRET)
          .update(req.rawBody ?? JSON.stringify(req.body))
          .digest("hex");

      const expectedBuffer = Buffer.from(expected);
      const receivedBuffer = Buffer.from(signature);

      if (
        expectedBuffer.length !== receivedBuffer.length ||
        !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
      ) {
        return res.sendStatus(401);
      }
    }

    const io = req.app.get("io");
    const result = await ingestMetaLead(req.body, io);

    return res.status(200).json({
      received: true,
      duplicate: result.duplicate,
      leadId: result.lead.id,
    });
  } catch (error: any) {
    console.error("[meta] webhook processing failed", error);

    return res.status(500).json({
      message: "Webhook processing failed",
    });
  }
});

/**
 * POST /api/meta/test-lead
 * Creates a local Meta-style test lead without calling Meta Graph API.
 */
r.post("/test-lead", auth, roles("ADMIN"), async (req, res) => {
  try {
    const io = req.app.get("io");

    const body = req.body ?? {};
   
    const testLeadgenId =
      body.leadgen_id || body.leadgenId || `TEST-${Date.now()}`;

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

                name: body.name || "Demo Meta Lead",

                email: body.email || "lead@example.com",

                phone: body.phone || "+91 98765 00000",

                campaign_name: body.campaign || "Demo Campaign",

                form_name: body.form_name || "Demo Lead Form",

                field_data: [
                  {
                    name: "full_name",
                    values: [body.name || "Demo Meta Lead"],
                  },
                  {
                    name: "email",
                    values: [body.email || "lead@example.com"],
                  },
                  {
                    name: "phone_number",
                    values: [body.phone || "+91 98765 00000"],
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    console.log(
      "[meta] generated test webhook:",
      JSON.stringify(payload, null, 2),
    );

    const result = await ingestMetaLead(payload, io, {
      fetchDetails: false,
    });

    return res.status(result.duplicate ? 200 : 201).json({
      success: true,
      duplicate: result.duplicate,
      lead: result.lead,
    });
  } catch (error: any) {
    console.error("[meta] test lead failed", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to create test lead",
    });
  }
});

export default r;
