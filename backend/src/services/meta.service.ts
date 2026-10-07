import { Lead } from "../models/Lead";
import { BusinessProject } from "../models/BusinessProject";
import {
  getDeliverySchedule,
  isWithinHoldWindow,
  chooseRandomSalesperson,
} from "./leadDelivery.service";
import { User } from "../models/User";
import { Notification } from "../models/Notification";
import { env } from "../config/env";
import { logActivity } from "../utils/activity";

type MetaField = {
  name: string;
  values: string[];
};

/**
 * Safely extracts the Meta webhook value object from different payload formats.
 */
function extractWebhookValue(payload: any) {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  // Standard Meta webhook:
  // { entry: [{ changes: [{ value: {...} }] }] }
  const entryValue = payload?.entry?.[0]?.changes?.[0]?.value;

  if (entryValue && typeof entryValue === "object") {
    return entryValue;
  }

  // Meta sample/test payload:
  // { sample: { value: {...} } }
  const sampleValue = payload?.sample?.value;

  if (sampleValue && typeof sampleValue === "object") {
    return sampleValue;
  }

  // Direct value payload:
  // { value: {...} }
  if (payload?.value && typeof payload.value === "object") {
    return payload.value;
  }

  // Sometimes changes can be supplied directly.
  const changeValue = payload?.changes?.[0]?.value;

  if (changeValue && typeof changeValue === "object") {
    return changeValue;
  }

  // Already a Meta value object.
  return payload;
}

/**
 * Extracts leadgen_id from all supported Meta webhook/test payload shapes.
 */
function extractLeadgenId(payload: any): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidates = [
    // Standard Meta webhook.
    payload?.entry?.[0]?.changes?.[0]?.value?.leadgen_id,

    // Meta sample/test payload.
    payload?.sample?.value?.leadgen_id,

    // Direct value payload.
    payload?.value?.leadgen_id,

    // Direct changes payload.
    payload?.changes?.[0]?.value?.leadgen_id,

    // Payload may already be the value object.
    payload?.leadgen_id,

    // Some test payloads can use this naming.
    payload?.leadgenId,

    // Nested test structures.
    payload?.sample?.leadgen_id,
  ];

  for (const candidate of candidates) {
    if (
      candidate !== undefined &&
      candidate !== null &&
      String(candidate).trim() !== ""
    ) {
      return String(candidate).trim();
    }
  }

  return null;
}

/**
 * Extracts field_data from Meta lead details or webhook payload.
 */
function extractFieldData(value: any, metaLead: any = null): MetaField[] {
  if (Array.isArray(metaLead?.field_data)) {
    return metaLead.field_data;
  }

  if (Array.isArray(value?.field_data)) {
    return value.field_data;
  }

  if (Array.isArray(value?.lead_fields)) {
    return value.lead_fields;
  }

  return [];
}

/**
 * Converts Meta field_data into a simple key/value map.
 */
function fieldMap(fields: MetaField[]) {
  const map: Record<string, string> = {};

  for (const field of fields) {
    if (!field?.name) {
      continue;
    }

    map[field.name] = Array.isArray(field.values)
      ? String(field.values[0] ?? "")
      : String(field.values ?? "");
  }

  return map;
}

/**
 * GET Meta lead details using the leadgen_id from the webhook.
 * The access token and Graph API version remain server-side.
 */
export async function fetchMetaLeadDetails(
  leadgenId: string,
  pageId?: string,
): Promise<any | null> {
  if (!leadgenId) {
    throw new Error("Meta leadgen_id is required");
  }

  if (!env.META_ACCESS_TOKEN || !env.META_GRAPH_VERSION) {
    throw new Error(
      "Meta access token or Graph API version is not configured",
    );
  }

  let url = "";

  if (env.META_LEAD_FETCH_URL && env.META_ACCESS_TOKEN) {
    const params = new URLSearchParams({
      fields: "id,created_time,field_data",
      access_token: env.META_ACCESS_TOKEN,
    });

    url = `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${encodeURIComponent(
      leadgenId,
    )}?${params.toString()}`;
  }

  console.log(
    `[meta] fetching lead details` +
      ` leadgen_id=${leadgenId}` +
      `${pageId ? ` page_id=${pageId}` : ""}` +
      ` graph=${env.META_GRAPH_VERSION}`,
  );

  const response = await fetch(url);

  const responseText = await response.text();

  let responseData: any = null;

  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = null;
  }

  if (!response.ok) {
    console.error("[meta] lead retrieval failed", {
      status: response.status,
      leadgenId,
      pageId,
      graphVersion: env.META_GRAPH_VERSION,
      error: responseData?.error ?? responseText,
    });

    throw new Error(
      `Meta lead retrieval failed: ${response.status} ${responseText}`,
    );
  }

  if (!responseData?.id) {
    throw new Error(
      `Meta returned an invalid lead response for leadgen_id=${leadgenId}`,
    );
  }

  console.log(
    `[meta] lead details fetched successfully leadgen_id=${leadgenId}`,
  );

  return responseData;
}

/**
 * Normalize the Meta webhook event plus optional Graph API lead details.
 */
export function normalizeMetaPayload(payload: any, metaLead: any = null) {
  const value = extractWebhookValue(payload);

  const fields = extractFieldData(value, metaLead);

  const map = fieldMap(fields);

  const leadgenId = extractLeadgenId(payload) ?? metaLead?.id ?? null;

  const createdTime =
    metaLead?.created_time ?? value?.created_time ?? undefined;

  return {
    metaLeadId: leadgenId,

    name: map.full_name ?? map.name ?? value?.name ?? "Meta Lead",

    email: map.email ?? value?.email,

    phone: map.phone_number ?? map.phone ?? value?.phone,

    campaign: value?.campaign_name ?? map.campaign_name,

    formName: value?.form_name ?? map.form_name,

    source: "META",

    meta: {
      businessId: undefined,
      fieldData: fields,

      rawPayload: metaLead ?? payload,

      pageId: value?.page_id,

      adId: value?.ad_id,

      adSetId: value?.adgroup_id ?? value?.ad_set_id,

      formId: value?.form_id,

      createdTime: createdTime
        ? new Date(
            typeof createdTime === "number" ? createdTime * 1000 : createdTime,
          )
        : undefined,
    },
  };
}

/**
 * POST /api/meta/webhook processing.
 * Retrieve complete lead details, deduplicate, persist and notify the CRM.
 */
export async function ingestMetaLead(
  payload: any,
  io: any,
  options: { fetchDetails?: boolean } = {},
) {
  console.log(
    "[meta] incoming webhook payload:",
    JSON.stringify(payload, null, 2),
  );

  const webhookValue = extractWebhookValue(payload);

  const leadgenId = extractLeadgenId(payload);

  console.log(`[meta] extracted leadgen_id=${leadgenId ?? "NOT_FOUND"}`);

  let metaLead: any = null;

  /**
   * Fetch complete lead information from Meta Graph API.
   */
  if (leadgenId && options.fetchDetails !== false) {
    metaLead = await fetchMetaLeadDetails(leadgenId);
  }

  const data = normalizeMetaPayload(payload, metaLead);

  /**
   * Final fallback:
   * If Meta returned the lead ID from Graph API,
   * use that ID even when the webhook itself did not expose it.
   */
  if (!data.metaLeadId && metaLead?.id) {
    data.metaLeadId = String(metaLead.id);
  }

  if (!data.metaLeadId) {
    console.error(
      "[meta] leadgen_id not found. Payload:",
      JSON.stringify(payload, null, 2),
    );

    throw new Error("Meta webhook did not contain a leadgen_id");
  }

  console.log(`[meta] processing leadgen_id=${data.metaLeadId}`);

  /**
   * Prevent duplicate Meta leads.
   */
  const existing = await Lead.findOne({
    metaLeadId: data.metaLeadId,
  });

  if (existing) {
    console.log(`[meta] duplicate lead ignored: ${data.metaLeadId}`);

    return {
      lead: existing,
      duplicate: true,
    };
  }

  /**
   * Match Meta source IDs to an admin-configured business project.
   */
  const project = await BusinessProject.findOne({
    isActive: true,
    metaSources: {
      $elemMatch: {
        $or: [
          ...(data.meta?.pageId ? [{ pageId: data.meta.pageId }] : []),
          ...(data.meta?.adId ? [{ adId: data.meta.adId }] : []),
          ...(data.meta?.formId ? [{ formId: data.meta.formId }] : []),
        ],
      },
    },
  }).select("_id name");

  if (project) {
    data.meta.businessId = project.id;
  }

  /**
   * Apply the global overnight delivery schedule. Held leads are persisted
   * immediately but are not assigned, notified or emitted until release.
   */
  const schedule = await getDeliverySchedule();
  const shouldHold = isWithinHoldWindow(schedule);
  const assignee = shouldHold ? null : await chooseRandomSalesperson();

  /**
   * Create the CRM lead.
   */
  const lead = await Lead.create({
    name: data.name,
    email: data.email,
    phone: data.phone,
    source: data.source,
    campaign: data.campaign,
    formName: data.formName,
    metaLeadId: data.metaLeadId,
    meta: data.meta,
    businessProject: project?._id,
    assignedTo: assignee?._id,
    assignedAt: assignee ? new Date() : undefined,
    assignmentSource: assignee ? "AUTO" : undefined,
    deliveryStatus: shouldHold ? "HELD" : "RELEASED",
    heldUntil: shouldHold ? schedule.holdUntil || new Date() : undefined,
    score: 50,
  });

  /**
   * Log lead creation.
   */
  await logActivity({
    lead: lead.id,
    actor: assignee?.id,
    type: shouldHold ? "LEAD_HELD" : "LEAD_CREATED",
    title: shouldHold ? "Lead held by delivery schedule" : "Lead received",
    description: shouldHold
      ? `Meta lead received during the configured hold window${project ? ` · ${project.name}` : ""}.`
      : `Lead received from Meta${data.formName ? ` · ${data.formName}` : ""}${project ? ` · ${project.name}` : ""}.`,
  });

  /**
   * Log automatic assignment.
   */
  if (assignee) {
    await logActivity({
      lead: lead.id,
      actor: assignee.id,
      type: "LEAD_ASSIGNED",
      title: "Lead assigned",
      description: `Assigned to ${assignee.name}.`,
    });
  }

  /**
   * Create notification records for
   * admin, manager and assigned salesperson.
   */
  if (!shouldHold) {
    const recipients = await User.find({
      isActive: true,
      $or: [{ role: { $in: ["ADMIN", "MANAGER"] } }, ...(assignee ? [{ _id: assignee._id }] : [])],
    }).select("_id");

    if (recipients.length) {
      await Notification.insertMany(
        recipients.map((user) => ({
          user: user._id,
          type: "NEW_LEAD",
          title: "New Meta lead",
          message: `New lead received: ${lead.name || "Unknown lead"}${lead.phone ? ` · ${lead.phone}` : ""}${lead.email ? ` · ${lead.email}` : ""}${lead.source ? ` · Source: ${lead.source}` : ""}${lead.campaign ? ` · Campaign: ${lead.campaign}` : ""}${lead.formName ? ` · Form: ${lead.formName}` : ""}${project ? ` · Project: ${project.name}` : ""}.`,
          entityType: "Lead",
          entityId: lead.id,
        })),
      );
    }

    if (io) {
      // Only admins receive the global lead stream. Salespeople receive
      // realtime events only through their own user room.
      console.log(
        `[realtime] emitting new_lead to admin/user scope ${lead.id}`,
      );
      io.to("role:ADMIN").emit("new_lead", { lead: lead.toObject() });
    }

    if (io && assignee?._id) {
      const assigneeId = String(assignee._id);
      console.log(`[realtime] emitting new_lead user:${assigneeId}`);
      io.to(`user:${assigneeId}`).emit("new_lead", { lead: lead.toObject() });
    } else if (io) {
      console.log(`[realtime] lead ${lead.id} has no salesperson assignment; only admin/manager notification sent`);
    }
  } else {
    console.log(`[meta] lead ${lead.id} held until the delivery window ends`);
  }

  return {
    lead,
    duplicate: false,
  };
}
