import { Router, Request } from "express";
import { auth, roles } from "../middleware/auth";
import { validateBody, objectId, z } from "../middleware/validate";
import { whatsappSendLimiter } from "../middleware/rateLimits";
import { WhatsAppSession, WhatsAppMessage, MessageTemplate } from "../models/WhatsApp";
import { Lead } from "../models/Lead";
import { Business } from "../models/Business";
import { BusinessProject } from "../models/BusinessProject";
import { whatsappManager } from "../services/whatsapp/sessionManager";
import { sentTodayCount } from "../services/whatsapp/queue";
import { renderTemplate, TEMPLATE_VARIABLES, DEFAULT_TEMPLATE_BODY, PRESET_TEMPLATES } from "../services/whatsapp/template";
import { canAccessLead } from "../utils/leadAccess";
import { normalizePhone } from "../utils/phone";
import { env } from "../config/env";

const r = Router();

/** The business whose WhatsApp the caller works with (never taken from user input for non-admins). */
async function callerBusinessId(req: Request): Promise<string | null> {
  const u = req.user!;
  if (u.role === "ADMIN" || u.role === "MANAGER") {
    const q = String(req.query.business || "");
    return objectId.safeParse(q).success ? q : null;
  }
  if (u.business) return String(u.business);
  if (u.businessProject) {
    const p = await BusinessProject.findById(u.businessProject).select("business").lean();
    return p?.business ? String(p.business) : null;
  }
  return null;
}

async function sessionView(businessId: string) {
  const [session, sentToday, queued] = await Promise.all([
    WhatsAppSession.findOne({ business: businessId }).populate("connectedBy", "name").lean(),
    sentTodayCount(businessId),
    WhatsAppMessage.countDocuments({ business: businessId, status: { $in: ["QUEUED", "SENDING"] } }),
  ]);
  const live = whatsappManager.getLiveStatus(businessId);
  return {
    enabled: env.WA_ENABLED,
    status: live?.status || (session?.status === "CONNECTED" ? "CONNECTING" : session?.status) || "DISCONNECTED",
    qr: live?.qr,
    phone: session?.phone,
    displayName: session?.displayName,
    connectedBy: (session as any)?.connectedBy?.name,
    lastConnectedAt: session?.lastConnectedAt,
    lastError: session?.lastError,
    sentToday,
    dailyLimit: env.WA_DAILY_LIMIT,
    queued,
  };
}

/* ------------------------------------------------------------------ */
/* Connection                                                          */
/* ------------------------------------------------------------------ */

r.get("/status", auth, async (req, res) => {
  const businessId = await callerBusinessId(req);
  if (!businessId) return res.json({ enabled: env.WA_ENABLED, status: "DISCONNECTED", noBusiness: true });
  const view = await sessionView(businessId);
  // Only the business owner sees the QR / connection internals.
  if (req.user!.role !== "BUSINESS") delete (view as any).qr;
  let canSend = false;
  if (req.user!.role === "BUSINESS") canSend = true;
  if (req.user!.role === "SALES") {
    const biz = await Business.findById(businessId).select("settings").lean();
    canSend = (biz as any)?.settings?.salesCanSendWhatsApp !== false;
  }
  res.json({ ...view, canSend });
});

r.post("/connect", auth, roles("BUSINESS"), async (req, res) => {
  const businessId = await callerBusinessId(req);
  if (!businessId) return res.status(400).json({ message: "Your account is not linked to a business" });
  if (!env.WA_ENABLED) return res.status(503).json({ message: "WhatsApp integration is disabled on this server" });
  try {
    await whatsappManager.start(businessId, { userId: req.user!.id });
    res.json(await sessionView(businessId));
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Could not start WhatsApp session" });
  }
});

r.post("/cancel", auth, roles("BUSINESS"), async (req, res) => {
  const businessId = await callerBusinessId(req);
  if (!businessId) return res.status(400).json({ message: "Your account is not linked to a business" });
  await whatsappManager.cancel(businessId);
  res.json(await sessionView(businessId));
});

r.post("/disconnect", auth, roles("BUSINESS"), async (req, res) => {
  const businessId = await callerBusinessId(req);
  if (!businessId) return res.status(400).json({ message: "Your account is not linked to a business" });
  await whatsappManager.logout(businessId);
  res.json(await sessionView(businessId));
});

/** Admin overview: connection status of every business (no message content). */
r.get("/admin/sessions", auth, roles("ADMIN", "MANAGER"), async (_req, res) => {
  const sessions = await WhatsAppSession.find()
    .select("business status phone lastConnectedAt lastError")
    .populate("business", "name")
    .lean();
  res.json({ sessions, enabled: env.WA_ENABLED, dailyLimit: env.WA_DAILY_LIMIT });
});

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

r.get("/templates", auth, async (req, res) => {
  const businessId = await callerBusinessId(req);
  const presets = PRESET_TEMPLATES;
  if (!businessId) return res.json({ templates: [], presets, variables: TEMPLATE_VARIABLES, defaultBody: DEFAULT_TEMPLATE_BODY });
  const templates = await MessageTemplate.find({ business: businessId }).sort({ isDefault: -1, createdAt: 1 }).lean();
  res.json({ templates, presets, variables: TEMPLATE_VARIABLES, defaultBody: DEFAULT_TEMPLATE_BODY });
});

const templateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  body: z.string().trim().min(1, "Message is required").max(4000),
  defaultDocumentIds: z.array(objectId).max(10).optional().default([]),
  isDefault: z.boolean().optional().default(false),
});

/* Templates are written and approved by the LeadFlow admin team (per business).
   Business owners and sales staff can only pick a template when sending. */

r.post("/templates", auth, roles("ADMIN", "MANAGER"), validateBody(templateSchema), async (req, res) => {
  const businessId = await callerBusinessId(req);
  if (!businessId) return res.status(400).json({ message: "Choose a business (?business=<id>)" });
  if ((await MessageTemplate.countDocuments({ business: businessId })) >= 30) {
    return res.status(400).json({ message: "You can keep up to 30 templates" });
  }
  if (req.body.isDefault) await MessageTemplate.updateMany({ business: businessId }, { $set: { isDefault: false } });
  const template = await MessageTemplate.create({ ...req.body, business: businessId, createdBy: req.user!.id });
  res.status(201).json({ template });
});

/** Add one of the ready-made templates to this business (owner can edit it afterwards). */
r.post("/templates/presets/:key", auth, roles("ADMIN", "MANAGER"), async (req, res) => {
  const businessId = await callerBusinessId(req);
  if (!businessId) return res.status(400).json({ message: "Choose a business (?business=<id>)" });
  const preset = PRESET_TEMPLATES.find((p) => p.key === req.params.key);
  if (!preset) return res.status(404).json({ message: "Template not found" });
  if ((await MessageTemplate.countDocuments({ business: businessId })) >= 30) {
    return res.status(400).json({ message: "You can keep up to 30 templates" });
  }
  const exists = await MessageTemplate.exists({ business: businessId, name: preset.name });
  const isFirst = !(await MessageTemplate.exists({ business: businessId }));
  const template = await MessageTemplate.create({
    business: businessId,
    name: exists ? `${preset.name} (copy)` : preset.name,
    body: preset.body,
    isDefault: isFirst,
    createdBy: req.user!.id,
  });
  res.status(201).json({ template });
});

r.put("/templates/:id", auth, roles("ADMIN", "MANAGER"), validateBody(templateSchema), async (req, res) => {
  const businessId = await callerBusinessId(req);
  const template = await MessageTemplate.findOne({ _id: req.params.id, business: businessId });
  if (!template) return res.status(404).json({ message: "Template not found" });
  if (req.body.isDefault) await MessageTemplate.updateMany({ business: businessId }, { $set: { isDefault: false } });
  Object.assign(template, req.body);
  await template.save();
  res.json({ template });
});

r.delete("/templates/:id", auth, roles("ADMIN", "MANAGER"), async (req, res) => {
  const businessId = await callerBusinessId(req);
  await MessageTemplate.deleteOne({ _id: req.params.id, business: businessId });
  res.json({ success: true });
});

/* ------------------------------------------------------------------ */
/* Compose & send for a lead                                           */
/* ------------------------------------------------------------------ */

/** Load a lead the caller may message, plus the business it belongs to. */
async function loadSendableLead(req: Request, leadId: string) {
  if (!objectId.safeParse(leadId).success) return { error: { status: 400, message: "Invalid lead id" } };
  if (!(await canAccessLead(req, leadId))) return { error: { status: 403, message: "You do not have access to this lead" } };

  const lead: any = await Lead.findById(leadId)
    .select("name phone email business businessProject assignedTo whatsappOptOut lastWhatsAppAt")
    .populate("businessProject", "name location reraNumber stage products documents business")
    .lean();
  if (!lead) return { error: { status: 404, message: "Lead not found" } };

  const businessId = String(lead.business || lead.businessProject?.business || "");
  if (!businessId) return { error: { status: 400, message: "This lead is not linked to a business project yet" } };

  const u = req.user!;
  if (u.role === "ADMIN" || u.role === "MANAGER") {
    return { error: { status: 403, message: "WhatsApp messages are sent by the business team. Admins can view history only." }, lead, businessId };
  }
  const myBusiness = await callerBusinessId(req);
  if (myBusiness !== businessId) return { error: { status: 403, message: "This lead belongs to another business" } };

  if (u.role === "SALES") {
    const biz = await Business.findById(businessId).select("settings").lean();
    if ((biz as any)?.settings?.salesCanSendWhatsApp === false) {
      return { error: { status: 403, message: "Your business owner has not enabled WhatsApp sending for sales staff" }, lead, businessId };
    }
    if (String(lead.assignedTo) !== u.id) {
      return { error: { status: 403, message: "You can only message leads assigned to you" }, lead, businessId };
    }
  }
  return { lead, businessId };
}

r.get("/leads/:leadId/compose", auth, async (req, res) => {
  const loaded = await loadSendableLead(req, String(req.params.leadId));
  if (loaded.error && !loaded.lead) return res.status(loaded.error.status).json({ message: loaded.error.message });
  const { lead, businessId } = loaded as { lead: any; businessId: string };

  const [business, templates, status] = await Promise.all([
    Business.findById(businessId).select("name contactNo").lean(),
    MessageTemplate.find({ business: businessId }).sort({ isDefault: -1, createdAt: 1 }).lean(),
    sessionView(businessId),
  ]);
  const project = lead.businessProject || null;
  const ctx = { lead, project, business, sender: { name: req.user!.name } };
  const documents = (project?.documents || [])
    .filter((d: any) => !d.isDemo || d.url)
    .map((d: any) => ({ _id: d._id, name: d.name, category: d.category, mimeType: d.mimeType, size: d.size }));

  res.json({
    canSend: !loaded.error,
    reason: loaded.error?.message,
    lead: { _id: lead._id, name: lead.name, phone: lead.phone, whatsappOptOut: lead.whatsappOptOut, lastWhatsAppAt: lead.lastWhatsAppAt },
    normalizedPhone: normalizePhone(lead.phone, env.WA_DEFAULT_COUNTRY_CODE),
    project: project ? { _id: project._id, name: project.name } : null,
    documents,
    templates: [
      ...templates.map((t: any) => ({ ...t, preview: renderTemplate(t.body, ctx) })),
      ...(templates.length
        ? []
        : PRESET_TEMPLATES.map((p, i) => ({
            _id: `preset:${p.key}`,
            name: p.name,
            body: p.body,
            isDefault: i === 0,
            defaultDocumentIds: [],
            preview: renderTemplate(p.body, ctx),
          }))),
    ],
    variables: TEMPLATE_VARIABLES,
    connection: { status: status.status, phone: status.phone, sentToday: status.sentToday, dailyLimit: status.dailyLimit, queued: status.queued },
  });
});

const sendSchema = z.object({
  /** Ignored. The text is rendered on the server from the chosen template. */
  body: z.string().trim().max(4000).optional().default(""),
  templateId: z.union([objectId, z.literal("default"), z.string().regex(/^preset:[a-z_]+$/), z.literal("")]).optional().default(""),
  documentIds: z.array(objectId).max(10).optional().default([]),
});

r.post("/leads/:leadId/send", auth, roles("BUSINESS", "SALES"), whatsappSendLimiter, validateBody(sendSchema), async (req, res) => {
  const loaded = await loadSendableLead(req, String(req.params.leadId));
  if (loaded.error) return res.status(loaded.error.status).json({ message: loaded.error.message });
  const { lead, businessId } = loaded as { lead: any; businessId: string };
  const body = req.body as z.infer<typeof sendSchema>;

  if (lead.whatsappOptOut) return res.status(400).json({ message: "This lead opted out of WhatsApp messages" });
  const to = normalizePhone(lead.phone, env.WA_DEFAULT_COUNTRY_CODE);
  if (!to) return res.status(400).json({ message: "This lead does not have a valid phone number" });

  // The wording always comes from a template the admin approved: business owners
  // and sales staff pick one, they never supply their own text.
  if (!body.templateId) return res.status(400).json({ message: "Choose a template to send" });

  const [sendBusiness, ownTemplateCount] = await Promise.all([
    Business.findById(businessId).select("name contactNo").lean(),
    MessageTemplate.countDocuments({ business: businessId }),
  ]);
  const ctx = { lead, project: lead.businessProject || null, business: sendBusiness, sender: { name: req.user!.name } };

  let templateBody: string;
  let templateRef: string | undefined;

  if (body.templateId.startsWith("preset:")) {
    // Presets are only offered while the business has no templates of its own.
    if (ownTemplateCount) return res.status(400).json({ message: "Choose one of your business templates" });
    const preset = PRESET_TEMPLATES.find((p) => `preset:${p.key}` === body.templateId);
    if (!preset) return res.status(400).json({ message: "That template is no longer available" });
    templateBody = preset.body;
  } else {
    const tpl: any =
      body.templateId === "default"
        ? await MessageTemplate.findOne({ business: businessId }).sort({ isDefault: -1, createdAt: 1 }).lean()
        : await MessageTemplate.findOne({ _id: body.templateId, business: businessId }).lean();
    if (!tpl) return res.status(400).json({ message: "That template does not belong to this business" });
    templateBody = tpl.body;
    templateRef = String(tpl._id);
  }

  const renderedBody = renderTemplate(templateBody, ctx).trim();
  if (!renderedBody && !body.documentIds.length) {
    return res.status(400).json({ message: "This template renders an empty message" });
  }

  if ((await sentTodayCount(businessId)) >= env.WA_DAILY_LIMIT) {
    return res.status(429).json({ message: `Daily WhatsApp limit of ${env.WA_DAILY_LIMIT} messages reached. This protects your number from being banned.` });
  }

  // Prevent accidental double-sends to the same lead within 2 minutes.
  const recent = await WhatsAppMessage.exists({
    lead: lead._id,
    status: { $in: ["QUEUED", "SENDING"] },
  });
  if (recent) return res.status(409).json({ message: "A message to this lead is already being sent" });

  const projectDocs: any[] = lead.businessProject?.documents || [];
  const documents = body.documentIds
    .map((id) => projectDocs.find((d) => String(d._id) === id))
    .filter(Boolean)
    .map((d: any) => ({ documentId: d._id, name: d.name, storageKey: d.storageKey, url: d.storageKey ? undefined : d.url, mimeType: d.mimeType || "application/pdf" }));
  if (documents.length !== body.documentIds.length) {
    return res.status(400).json({ message: "Documents must belong to this lead's project" });
  }

  const message = await WhatsAppMessage.create({
    business: businessId,
    lead: lead._id,
    sentBy: req.user!.id,
    to,
    body: renderedBody,
    template: templateRef,
    documents,
    status: "QUEUED",
  });

  const connected = whatsappManager.isConnected(businessId);
  res.status(202).json({
    message,
    info: connected
      ? "Queued — it will be sent in a few seconds."
      : "Queued — WhatsApp is not connected right now. It will be sent as soon as the business reconnects.",
  });
});

r.get("/leads/:leadId/messages", auth, async (req, res) => {
  const leadId = String(req.params.leadId);
  if (!objectId.safeParse(leadId).success) return res.status(400).json({ message: "Invalid lead id" });
  if (!(await canAccessLead(req, leadId))) return res.status(403).json({ message: "You do not have access to this lead" });
  const messages = await WhatsAppMessage.find({ lead: leadId })
    .select("-waMessageIds -documents.storageKey -documents.url")
    .populate("sentBy", "name")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.json({ messages });
});

r.post("/messages/:id/cancel", auth, roles("BUSINESS", "SALES"), async (req, res) => {
  const businessId = await callerBusinessId(req);
  const filter: Record<string, unknown> = { _id: req.params.id, business: businessId, status: "QUEUED" };
  if (req.user!.role === "SALES") filter.sentBy = req.user!.id;
  const msg = await WhatsAppMessage.findOneAndUpdate(filter, { $set: { status: "CANCELLED" } }, { new: true });
  if (!msg) return res.status(404).json({ message: "Queued message not found" });
  res.json({ message: msg });
});

/** Business-wide outbox (owner only). */
r.get("/messages", auth, roles("BUSINESS"), async (req, res) => {
  const businessId = await callerBusinessId(req);
  const p = Math.max(1, Number(req.query.page) || 1);
  const l = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const q: Record<string, unknown> = { business: businessId };
  if (req.query.status) q.status = String(req.query.status);
  const [messages, total] = await Promise.all([
    WhatsAppMessage.find(q)
      .select("-waMessageIds -documents.storageKey -documents.url")
      .populate("lead", "name phone")
      .populate("sentBy", "name")
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    WhatsAppMessage.countDocuments(q),
  ]);
  res.json({ messages, total, page: p, pages: Math.max(1, Math.ceil(total / l)) });
});

export default r;
