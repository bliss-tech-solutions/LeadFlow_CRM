import { randomBytes, randomUUID, timingSafeEqual } from "crypto";
import express, { Router } from "express";
import ExcelJS from "exceljs";
import { auth, roles } from "../middleware/auth";
import { validateBody, looseText, objectId, z } from "../middleware/validate";
import { webhookLimiter } from "../middleware/rateLimits";
import { Lead } from "../models/Lead";
import { WhatsAppSession } from "../models/WhatsApp";
import { Contact, OutreachMessage, OutreachSettings, OutreachTemplate, OUTREACH_CHANNELS, OUTREACH_WA_ID, type OutreachStatus } from "../models/Outreach";
import { whatsappManager } from "../services/whatsapp/sessionManager";
import { outreachWaDailyLimit, outreachWaSentToday } from "../services/outreachWhatsApp.service";
import { renderTemplate } from "../services/whatsapp/template";
import { isSmsConfigured, sendSmsFlow, parseDeliveryReports, getSmsCredentials, clearSmsCredentialsCache } from "../services/sms.service";
import { encryptString } from "../utils/crypto";
import { normalizePhone, phoneTail, firstValidPhone, formatPhoneDisplay } from "../utils/phone";
import { containsRegex, escapeRegex } from "../utils/regex";
import { getIO } from "../sockets";
import { addContacts } from "../services/contacts.service";
import { scrapeNext } from "../services/demoScrape.service";
import { env } from "../config/env";
import { logger } from "../config/logger";

const r = Router();
const admin = [auth, roles("ADMIN", "MANAGER")];

const PER_PAGE = 100;

const pageOf = (v: unknown) => Math.max(1, Math.min(100000, Math.floor(Number(v)) || 1));

function emitUpdate(batchId?: string) {
  getIO()?.to("role:ADMIN").emit("outreach_updated", { batchId });
}

/* ------------------------------------------------------------------ */
/* Contacts: every lead + every manually added contact                 */
/* ------------------------------------------------------------------ */

type Row = { _id: string; kind: "CONTACT"; name: string; phone: string; createdAt: Date };

/** Contact Data reads only its own collection (name + mobile). */
async function listContacts(query: Record<string, unknown>) {
  const page = pageOf(query.page);
  const q = typeof query.q === "string" ? query.q.trim() : "";
  const digits = q.replace(/\D/g, "");
  const filter = q ? { $or: [{ name: containsRegex(q) }, ...(digits.length >= 3 ? [{ phone: containsRegex(digits) }] : [])] } : {};

  const [rows, total] = await Promise.all([
    Contact.find(filter)
      .select("name phone createdAt")
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * PER_PAGE)
      .limit(PER_PAGE)
      .lean(),
    q ? Contact.countDocuments(filter) : Contact.estimatedDocumentCount(),
  ]);
  const contacts: Row[] = rows.map((c: any) => ({ _id: String(c._id), kind: "CONTACT", name: c.name || "", phone: c.phone || "", createdAt: c.createdAt }));
  return { contacts, total, page, pages: Math.max(1, Math.ceil(total / PER_PAGE)), perPage: PER_PAGE };
}

/** GET /api/outreach/contacts?page=&q= — 100 per page, newest first. */
r.get("/contacts", ...admin, async (req, res) => {
  res.json(await listContacts(req.query as Record<string, unknown>));
});

/** GET /api/outreach/contacts/export?page=&q= — Excel of the same 100 rows. */
r.get("/contacts/export", ...admin, async (req, res) => {
  const { contacts, page } = await listContacts(req.query as Record<string, unknown>);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LeadFlow CRM";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(`Contacts p${page}`);
  sheet.columns = [
    { header: "No.", key: "n", width: 8 },
    { header: "Name", key: "name", width: 28 },
    { header: "Contact No.", key: "phone", width: 20 },
  ];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  header.height = 22;
  contacts.forEach((c, i) => sheet.addRow({ n: (page - 1) * PER_PAGE + i + 1, name: c.name, phone: formatPhoneDisplay(c.phone) }));

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="contacts-page-${page}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

const contactInput = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    phone: z.string().trim().min(1, "Mobile number is required").max(30),
  });

/** POST /api/outreach/contacts — add one contact. */
r.post("/contacts", ...admin, validateBody(contactInput), async (req, res) => {
  const phone = normalizePhone(req.body.phone, env.WA_DEFAULT_COUNTRY_CODE);
  if (!phone) return res.status(400).json({ message: "That mobile number is not valid" });
  if (await Contact.exists({ phone })) return res.status(409).json({ message: "A contact with this mobile number already exists" });

  const contact = await Contact.create({ name: req.body.name, phone, source: "MANUAL", createdBy: req.user!.id });
  res.status(201).json({ contact });
});

export const CONTACT_IMPORT_MAX = 5000;

/**
 * POST /api/outreach/contacts/bulk — CSV / Excel upload (max 5000 rows).
 * Only name + mobile are stored; rows without a valid mobile are skipped.
 */
r.post(
  "/contacts/bulk",
  ...admin,
  validateBody(
    z.object({
      rows: z
        .array(z.object({ name: looseText(200), phone: looseText(200) }))
        .min(1, "The file has no rows")
        .max(CONTACT_IMPORT_MAX, `Upload at most ${CONTACT_IMPORT_MAX} rows at a time`),
    })
  ),
  async (req, res) => {
    const rows = req.body.rows as { name: string; phone: string }[];
    const valid: { name: string; phone: string }[] = [];
    for (const row of rows) {
      const phone = firstValidPhone(row.phone, env.WA_DEFAULT_COUNTRY_CODE);
      if (phone) valid.push({ name: row.name, phone });
    }
    const added = await addContacts(valid, "IMPORT", req.user!.id);
    const invalid = rows.length - valid.length;
    res.json({ added, duplicates: valid.length - added, invalid, total: rows.length });
  }
);

/**
 * POST /api/outreach/scrape/next — Data scraping demo tick. Moves a random
 * handful of rows from the "demodata" collection into Contact Data.
 */
r.post("/scrape/next", ...admin, async (req, res) => {
  const out = await scrapeNext(req.user!.id);
  res.json(out);
});

/** DELETE /api/outreach/contacts/:id — remove a contact from Contact Data (the lead itself is untouched). */
r.delete("/contacts/:id", ...admin, async (req, res) => {
  const id = String(req.params.id);
  if (!objectId.safeParse(id).success) return res.status(400).json({ message: "Invalid id" });
  const out = await Contact.deleteOne({ _id: id });
  if (!out.deletedCount) return res.status(404).json({ message: "Contact not found" });
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

const VARIABLES = [
  { key: "name", label: "Full name" },
  { key: "first_name", label: "First name" },
];

/** GET /api/outreach/config — which channels are ready, plus template variables. */
r.get("/config", ...admin, async (_req, res) => {
  res.json({
    channels: { SMS: await isSmsConfigured(), WHATSAPP: env.WA_ENABLED },
    whatsappConnected: whatsappManager.isConnected(OUTREACH_WA_ID),
    variables: VARIABLES,
  });
});

r.get("/templates", ...admin, async (req, res) => {
  const channel = OUTREACH_CHANNELS.find((c) => c === req.query.channel);
  const templates = await OutreachTemplate.find(channel ? { channel } : {}).sort({ channel: 1, name: 1 }).lean();
  res.json({ templates });
});

const templateInput = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80),
    channel: z.enum(OUTREACH_CHANNELS),
    body: z.string().trim().min(1, "Message is required").max(4000),
    providerTemplateId: z.string().trim().max(80).optional().default(""),
    dltTemplateId: z.string().trim().max(80).optional().default(""),
  })
  .refine((t) => t.channel !== "SMS" || t.providerTemplateId, { message: "SMS templates need the MSG91 template ID", path: ["providerTemplateId"] })
  .refine((t) => t.channel !== "SMS" || t.body.length <= 1000, { message: "SMS text is too long", path: ["body"] });

r.post("/templates", ...admin, validateBody(templateInput), async (req, res) => {
  const template = await OutreachTemplate.create({ ...req.body, createdBy: req.user!.id });
  res.status(201).json({ template });
});

r.patch("/templates/:id", ...admin, validateBody(templateInput), async (req, res) => {
  const id = String(req.params.id);
  if (!objectId.safeParse(id).success) return res.status(400).json({ message: "Invalid id" });
  const template = await OutreachTemplate.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
  if (!template) return res.status(404).json({ message: "Template not found" });
  res.json({ template });
});

r.delete("/templates/:id", ...admin, async (req, res) => {
  const id = String(req.params.id);
  if (!objectId.safeParse(id).success) return res.status(400).json({ message: "Invalid id" });
  await OutreachTemplate.deleteOne({ _id: id });
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Send (single or bulk)                                               */
/* ------------------------------------------------------------------ */

const sendInput = z.object({
  channel: z.enum(OUTREACH_CHANNELS),
  templateId: objectId,
  body: z.string().trim().max(4000).optional(),
  recipients: z
    .array(z.object({ kind: z.enum(["LEAD", "CONTACT"]), id: objectId }))
    .min(1, "Select at least one contact")
    .max(500, "You can send to at most 500 contacts at once"),
});

/** POST /api/outreach/send — queue a message for each selected contact. */
r.post("/send", ...admin, validateBody(sendInput), async (req, res) => {
  const { channel, templateId, recipients } = req.body as z.infer<typeof sendInput>;

  const tpl: any = await OutreachTemplate.findById(templateId).lean();
  if (!tpl || tpl.channel !== channel) return res.status(400).json({ message: "Choose a template for this channel" });
  if (channel === "SMS" && !(await isSmsConfigured())) return res.status(400).json({ message: "SMS gateway is not set up yet. Open Setup → SMS and add your MSG91 auth key." });
  if (channel === "WHATSAPP" && !env.WA_ENABLED) return res.status(400).json({ message: "WhatsApp is disabled on this server" });

  // SMS text is fixed by DLT; WhatsApp text may be edited before sending.
  const bodyText = channel === "SMS" ? tpl.body : req.body.body || tpl.body;

  const unique = [...new Map(recipients.map((x) => [`${x.kind}:${x.id}`, x])).values()];
  const leadIds = unique.filter((x) => x.kind === "LEAD").map((x) => x.id);
  const contactIds = unique.filter((x) => x.kind === "CONTACT").map((x) => x.id);
  const [leads, contacts] = await Promise.all([
    Lead.find({ _id: { $in: leadIds } }).select("name phone business").populate("business", "name").lean(),
    Contact.find({ _id: { $in: contactIds } }).select("name phone").lean(),
  ]);
  const byKey = new Map<string, any>();
  leads.forEach((l: any) => byKey.set(`LEAD:${l._id}`, l));
  contacts.forEach((c: any) => byKey.set(`CONTACT:${c._id}`, c));

  // Numbers that already have a WhatsApp message waiting, to avoid double sends.
  const busyNumbers =
    channel === "WHATSAPP"
      ? new Set((await OutreachMessage.find({ channel: "WHATSAPP", status: { $in: ["QUEUED", "SENDING"] } }).select("to").lean()).map((m: any) => m.to))
      : new Set<string>();

  const batchId = randomUUID();
  const sentBy = req.user!.id;
  const docs: any[] = [];

  for (const rcp of unique) {
    const p = byKey.get(`${rcp.kind}:${rcp.id}`);
    if (!p) continue;
    const ctx = { lead: { name: p.name, phone: p.phone }, business: rcp.kind === "LEAD" ? p.business : null };
    const doc: any = {
      batchId,
      channel,
      kind: rcp.kind,
      lead: rcp.kind === "LEAD" ? p._id : undefined,
      contact: rcp.kind === "CONTACT" ? p._id : undefined,
      name: p.name || "",
      to: normalizePhone(p.phone, env.WA_DEFAULT_COUNTRY_CODE) || "",
      body: renderTemplate(bodyText, ctx),
      template: tpl._id,
      status: "QUEUED" as OutreachStatus,
      sentBy,
    };
    const skip = (reason: string) => Object.assign(doc, { status: "SKIPPED", error: reason });

    if (!doc.to) skip("No valid mobile number");

    if (channel === "WHATSAPP" && doc.status === "QUEUED") {
      if (!doc.body) skip("Template renders an empty message");
      else if (busyNumbers.has(doc.to)) skip("A WhatsApp message to this number is already waiting");
      else busyNumbers.add(doc.to);
    }
    docs.push(doc);
  }

  const saved = docs.length ? await OutreachMessage.insertMany(docs) : [];
  const queued = saved.filter((m) => m.status === "QUEUED").length;
  const waOffline = channel === "WHATSAPP" && !whatsappManager.isConnected(OUTREACH_WA_ID);
  res.status(202).json({
    batchId,
    queued,
    skipped: saved.length - queued,
    total: saved.length,
    info: waOffline ? "WhatsApp is not connected. Messages will go out as soon as you connect it in Setup → WhatsApp." : undefined,
  });

  if (queued && channel === "SMS") {
    void dispatchSms(batchId, tpl).catch((e) => logger.error("[outreach] dispatch failed", { batchId, error: e?.message }));
  } else emitUpdate(batchId);
});

async function dispatchSms(batchId: string, tpl: any) {
  const rows = await OutreachMessage.find({ batchId, status: "QUEUED" }).lean();
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const ids = chunk.map((m) => m._id);
    try {
      const requestId = await sendSmsFlow(
        tpl.providerTemplateId,
        chunk.map((m) => {
          const name = String(m.name || "").trim();
          return { mobile: m.to, vars: { name, first_name: name.split(/\s+/)[0] || "", var1: name } };
        })
      );
      await OutreachMessage.updateMany({ _id: { $in: ids } }, { status: "SENT", providerRef: requestId, sentAt: new Date() });
    } catch (e: any) {
      await OutreachMessage.updateMany({ _id: { $in: ids } }, { status: "FAILED", error: String(e?.message || "SMS failed").slice(0, 300) });
    }
    emitUpdate(batchId);
  }
}

/* ------------------------------------------------------------------ */
/* Setup: SMS gateway + WhatsApp numbers                               */
/* ------------------------------------------------------------------ */

function publicBaseUrl(req: any) {
  return `${req.protocol}://${req.get("host")}`;
}

async function smsSettingsView(req: any) {
  const creds = await getSmsCredentials();
  return {
    configured: Boolean(creds.authKey),
    source: creds.source,
    authKeyHint: creds.authKey ? `••••${creds.authKey.slice(-4)}` : "",
    senderId: creds.senderId || "",
    webhookUrl: creds.webhookToken ? `${publicBaseUrl(req)}/api/outreach/sms/webhook?token=${creds.webhookToken}` : "",
  };
}

/** GET /api/outreach/settings/sms — the key itself is never returned, only its last 4 characters. */
r.get("/settings/sms", ...admin, async (req, res) => {
  res.json(await smsSettingsView(req));
});

/** PUT /api/outreach/settings/sms — save the MSG91 auth key (encrypted) and sender ID. */
r.put(
  "/settings/sms",
  ...admin,
  validateBody(
    z.object({
      authKey: z.string().trim().max(200).optional(),
      senderId: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9]{0,11}$/, "Sender ID is up to 11 letters/digits, e.g. LDFLOW")
        .optional(),
      removeAuthKey: z.boolean().optional(),
    })
  ),
  async (req, res) => {
    const { authKey, senderId, removeAuthKey } = req.body as { authKey?: string; senderId?: string; removeAuthKey?: boolean };
    if (authKey && authKey.length < 10) return res.status(400).json({ message: "That auth key looks too short" });

    const current: any = await OutreachSettings.findOne({ key: "sms" }).lean();
    const update: Record<string, unknown> = { updatedBy: req.user!.id };
    if (authKey) update.authKeyEnc = encryptString(authKey);
    if (removeAuthKey) update.authKeyEnc = null;
    if (senderId !== undefined) update.senderId = senderId.toUpperCase();
    if (!current?.webhookToken) update.webhookToken = randomBytes(24).toString("hex");

    await OutreachSettings.updateOne({ key: "sms" }, { $set: update, $setOnInsert: { key: "sms" } }, { upsert: true });
    clearSmsCredentialsCache();
    res.json(await smsSettingsView(req));
  }
);

/** POST /api/outreach/settings/sms/webhook-token — issue a new delivery-report URL. */
r.post("/settings/sms/webhook-token", ...admin, async (req, res) => {
  await OutreachSettings.updateOne(
    { key: "sms" },
    { $set: { webhookToken: randomBytes(24).toString("hex"), updatedBy: req.user!.id }, $setOnInsert: { key: "sms" } },
    { upsert: true }
  );
  clearSmsCredentialsCache();
  res.json(await smsSettingsView(req));
});

/** POST /api/outreach/settings/sms/test — send one SMS with a template to check the setup. */
r.post(
  "/settings/sms/test",
  ...admin,
  validateBody(z.object({ mobile: z.string().trim().min(1, "Enter a mobile number").max(30), templateId: objectId })),
  async (req, res) => {
    const mobile = normalizePhone(req.body.mobile, env.WA_DEFAULT_COUNTRY_CODE);
    if (!mobile) return res.status(400).json({ message: "That mobile number is not valid" });
    const tpl: any = await OutreachTemplate.findOne({ _id: req.body.templateId, channel: "SMS" }).lean();
    if (!tpl) return res.status(400).json({ message: "Choose an SMS template" });
    try {
      const name = req.user!.name || "Test";
      const requestId = await sendSmsFlow(tpl.providerTemplateId, [{ mobile, vars: { name, first_name: name.split(/\s+/)[0], var1: name } }]);
      res.json({ ok: true, requestId, message: `Test SMS accepted by MSG91 (request ${requestId}).` });
    } catch (e: any) {
      res.status(400).json({ message: e?.message || "Test SMS failed" });
    }
  }
);

async function whatsappView() {
  const [session, sentToday, queued, dailyLimit] = await Promise.all([
    WhatsAppSession.findOne({ business: OUTREACH_WA_ID }).populate("connectedBy", "name").lean(),
    outreachWaSentToday(),
    OutreachMessage.countDocuments({ channel: "WHATSAPP", status: { $in: ["QUEUED", "SENDING"] } }),
    outreachWaDailyLimit(),
  ]);
  const live = whatsappManager.getLiveStatus(OUTREACH_WA_ID);
  const s: any = session;
  return {
    enabled: env.WA_ENABLED,
    status: live?.status || (s?.status === "CONNECTED" ? "CONNECTING" : s?.status) || "DISCONNECTED",
    qr: live?.qr,
    phone: s?.phone || "",
    displayName: s?.displayName || "",
    connectedBy: s?.connectedBy?.name || "",
    lastConnectedAt: s?.lastConnectedAt,
    lastError: s?.lastError,
    sentToday,
    dailyLimit,
    queued,
  };
}

/** GET /api/outreach/settings/whatsapp — LeadFlow's own messaging number (not any business's). */
r.get("/settings/whatsapp", ...admin, async (_req, res) => {
  res.json(await whatsappView());
});

/** POST /api/outreach/settings/whatsapp/connect — start linking; QR codes arrive over the socket. */
r.post("/settings/whatsapp/connect", ...admin, async (req, res) => {
  if (!env.WA_ENABLED) return res.status(400).json({ message: "WhatsApp is turned off on this server" });
  try {
    await whatsappManager.start(OUTREACH_WA_ID, { userId: req.user!.id });
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || "Could not start WhatsApp" });
  }
  res.json(await whatsappView());
});

r.post("/settings/whatsapp/cancel", ...admin, async (_req, res) => {
  await whatsappManager.cancel(OUTREACH_WA_ID);
  res.json(await whatsappView());
});

/** POST /api/outreach/settings/whatsapp/disconnect — log out the number (also removes it from the phone's linked devices). */
r.post("/settings/whatsapp/disconnect", ...admin, async (_req, res) => {
  await whatsappManager.logout(OUTREACH_WA_ID);
  res.json(await whatsappView());
});

/** PUT /api/outreach/settings/whatsapp — sending limits for the outreach number. */
r.put(
  "/settings/whatsapp",
  ...admin,
  validateBody(z.object({ dailyLimit: z.coerce.number().int().min(1, "At least 1 per day").max(1000, "At most 1000 per day") })),
  async (req, res) => {
    await OutreachSettings.updateOne(
      { key: "whatsapp" },
      { $set: { dailyLimit: req.body.dailyLimit, updatedBy: req.user!.id }, $setOnInsert: { key: "whatsapp" } },
      { upsert: true }
    );
    res.json(await whatsappView());
  }
);

/** POST /api/outreach/settings/whatsapp/clear-queue — cancel messages still waiting to be sent. */
r.post("/settings/whatsapp/clear-queue", ...admin, async (_req, res) => {
  const out = await OutreachMessage.updateMany({ channel: "WHATSAPP", status: "QUEUED" }, { $set: { status: "FAILED", error: "Cancelled from setup" } });
  emitUpdate();
  res.json({ cancelled: out.modifiedCount, ...(await whatsappView()) });
});

/* ------------------------------------------------------------------ */
/* Status log                                                          */
/* ------------------------------------------------------------------ */

/** GET /api/outreach/messages?page=&channel=&status=&q= */
r.get("/messages", ...admin, async (req, res) => {
  const page = pageOf(req.query.page);
  const filter: Record<string, unknown> = {};
  const channel = OUTREACH_CHANNELS.find((c) => c === req.query.channel);
  if (channel) filter.channel = channel;
  const status = ["QUEUED", "SENDING", "SENT", "DELIVERED", "READ", "FAILED", "SKIPPED"].find((s) => s === req.query.status);
  if (status) filter.status = status;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q) filter.$or = [{ name: containsRegex(q) }, { to: containsRegex(q) }];

  const [messages, total] = await Promise.all([
    OutreachMessage.find(filter)
      .select("channel kind name to body status error sentAt deliveredAt createdAt sentBy template")
      .populate("sentBy", "name")
      .populate("template", "name")
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * PER_PAGE)
      .limit(PER_PAGE)
      .lean(),
    OutreachMessage.countDocuments(filter),
  ]);
  res.json({ messages, total, page, pages: Math.max(1, Math.ceil(total / PER_PAGE)) });
});

/* ------------------------------------------------------------------ */
/* MSG91 delivery reports                                              */
/* ------------------------------------------------------------------ */

async function tokenOk(given: unknown) {
  const expected = (await getSmsCredentials()).webhookToken;
  if (!expected || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** POST /api/outreach/sms/webhook?token=... — set this URL as the delivery-report webhook in MSG91. */
r.post("/sms/webhook", webhookLimiter, express.urlencoded({ extended: false, limit: "1mb" }), async (req, res) => {
  if (!(await tokenOk(req.query.token))) return res.status(401).json({ message: "Invalid token" });

  const reports = parseDeliveryReports(req.body);
  for (const rep of reports) {
    const tail = phoneTail(rep.number);
    if (!tail) continue;
    const update = rep.delivered
      ? { status: "DELIVERED", deliveredAt: new Date() }
      : rep.failed
        ? { status: "FAILED", error: rep.description.slice(0, 200) }
        : null;
    if (!update) continue;
    await OutreachMessage.updateMany(
      { channel: "SMS", providerRef: rep.requestId, to: { $regex: `${escapeRegex(tail)}$` }, status: { $in: ["QUEUED", "SENT"] } },
      update
    );
  }
  if (reports.length) emitUpdate();
  res.json({ ok: true, received: reports.length });
});

export default r;
