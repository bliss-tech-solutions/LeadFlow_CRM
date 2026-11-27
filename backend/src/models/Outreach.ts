import { Schema, model, type Document, type Types } from "mongoose";

/* ------------------------------------------------------------------ */
/* Contact: name + mobile only. Filled automatically from every new   */
/* lead, and by CSV upload / manual add on the Contact Data page.     */
/* ------------------------------------------------------------------ */

export type ContactSource = "LEAD" | "IMPORT" | "MANUAL" | "SCRAPE";

export interface IContact extends Document {
  name: string;
  /** Digits-only international number, e.g. 919876543210. One contact per number. */
  phone: string;
  source: ContactSource;
  lead?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  createdAt: Date;
}

const contactSchema = new Schema<IContact>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true },
    source: { type: String, enum: ["LEAD", "IMPORT", "MANUAL", "SCRAPE"], default: "MANUAL", index: true },
    lead: { type: Schema.Types.ObjectId, ref: "Lead" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
contactSchema.index({ phone: 1 }, { unique: true });
contactSchema.index({ createdAt: -1, _id: -1 });
contactSchema.index({ name: 1 });

export const Contact = model<IContact>("Contact", contactSchema);

/* ------------------------------------------------------------------ */
/* DemoContact ("demodata"): pool behind the Data scraping demo.      */
/* Loaded from a Google Sheet; each scrape moves a few random unused  */
/* rows into Contact Data and marks them used.                        */
/* ------------------------------------------------------------------ */

export interface IDemoContact extends Document {
  name: string;
  phone: string;
  usedAt?: Date | null;
}

const demoContactSchema = new Schema<IDemoContact>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true },
    usedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, collection: "demodata" },
);
demoContactSchema.index({ phone: 1 }, { unique: true });

export const DemoContact = model<IDemoContact>("DemoContact", demoContactSchema);

/* ------------------------------------------------------------------ */
/* Template: reusable SMS / WhatsApp message                          */
/* ------------------------------------------------------------------ */

export type OutreachChannel = "SMS" | "WHATSAPP";
export const OUTREACH_CHANNELS = ["SMS", "WHATSAPP"] as const;

/**
 * Session id of LeadFlow's own WhatsApp number used for Contact Data messaging.
 * It is not a Business: it only keys the WhatsApp session + auth state, keeping
 * this number fully separate from every business's linked WhatsApp.
 */
export const OUTREACH_WA_ID = "000000000000000000000001";

export interface IOutreachTemplate extends Document {
  name: string;
  channel: OutreachChannel;
  subject?: string;
  body: string;
  /** SMS only: the MSG91 Flow template id (which is linked to the DLT template). */
  providerTemplateId?: string;
  /** SMS only: DLT template id, for reference. */
  dltTemplateId?: string;
  createdBy?: Types.ObjectId;
}

const templateSchema = new Schema<IOutreachTemplate>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    channel: { type: String, enum: OUTREACH_CHANNELS, required: true, index: true },
    subject: { type: String, trim: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 4000 },
    providerTemplateId: { type: String, trim: true, maxlength: 80 },
    dltTemplateId: { type: String, trim: true, maxlength: 80 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export const OutreachTemplate = model<IOutreachTemplate>("OutreachTemplate", templateSchema);

/* ------------------------------------------------------------------ */
/* Message log: one row per recipient per send                         */
/* ------------------------------------------------------------------ */

export type OutreachStatus = "QUEUED" | "SENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "SKIPPED";

export interface IOutreachMessage extends Document {
  batchId: string;
  channel: OutreachChannel;
  kind: "LEAD" | "CONTACT";
  lead?: Types.ObjectId;
  contact?: Types.ObjectId;
  name: string;
  to: string;
  subject?: string;
  body: string;
  template?: Types.ObjectId;
  status: OutreachStatus;
  error?: string;
  /** SMS: MSG91 request id (shared by every number in one API call). */
  providerRef?: string;
  /** WhatsApp: ids returned by WhatsApp, matched against delivery/read receipts. */
  waMessageIds: string[];
  attempts: number;
  nextAttemptAt?: Date;
  sentBy: Types.ObjectId;
  sentAt?: Date;
  deliveredAt?: Date;
  createdAt: Date;
}

const messageSchema = new Schema<IOutreachMessage>(
  {
    batchId: { type: String, required: true, index: true },
    channel: { type: String, enum: OUTREACH_CHANNELS, required: true, index: true },
    kind: { type: String, enum: ["LEAD", "CONTACT"], required: true },
    lead: { type: Schema.Types.ObjectId, ref: "Lead" },
    contact: { type: Schema.Types.ObjectId, ref: "Contact" },
    name: { type: String, default: "" },
    to: { type: String, default: "" },
    subject: String,
    body: { type: String, default: "", maxlength: 4096 },
    template: { type: Schema.Types.ObjectId, ref: "OutreachTemplate" },
    status: {
      type: String,
      enum: ["QUEUED", "SENDING", "SENT", "DELIVERED", "READ", "FAILED", "SKIPPED"],
      default: "QUEUED",
      index: true,
    },
    error: String,
    providerRef: { type: String, index: true },
    waMessageIds: { type: [String], default: [], index: true },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: Date,
    sentBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    sentAt: Date,
    deliveredAt: Date,
  },
  { timestamps: true },
);
messageSchema.index({ createdAt: -1 });

export const OutreachMessage = model<IOutreachMessage>("OutreachMessage", messageSchema);

/* ------------------------------------------------------------------ */
/* Settings entered from the dashboard (SMS gateway, WhatsApp limits)  */
/* ------------------------------------------------------------------ */

export interface IOutreachSettings extends Document {
  key: "sms" | "whatsapp" | "contacts";
  /** WhatsApp: max messages per day from the outreach number. */
  dailyLimit?: number;
  backfilledAt?: Date;
  /** MSG91 auth key, AES-GCM encrypted (utils/crypto). Never returned to the client. */
  authKeyEnc?: string;
  senderId?: string;
  webhookToken?: string;
  updatedBy?: Types.ObjectId;
  updatedAt: Date;
}

const settingsSchema = new Schema<IOutreachSettings>(
  {
    key: { type: String, enum: ["sms", "whatsapp", "contacts"], required: true, unique: true },
    /** contacts: set once every existing lead has been copied into Contact. */
    backfilledAt: Date,
    dailyLimit: { type: Number, min: 1, max: 1000 },
    authKeyEnc: String,
    senderId: { type: String, trim: true, maxlength: 11 },
    webhookToken: String,
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export const OutreachSettings = model<IOutreachSettings>("OutreachSettings", settingsSchema);
