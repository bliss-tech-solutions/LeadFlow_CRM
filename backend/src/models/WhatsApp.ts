import { Schema, model, Types, Document } from "mongoose";

/* ------------------------------------------------------------------ */
/* Session: one linked WhatsApp device per business                    */
/* ------------------------------------------------------------------ */

export type WhatsAppSessionStatus = "DISCONNECTED" | "CONNECTING" | "QR" | "CONNECTED" | "LOGGED_OUT";

export interface IWhatsAppSession extends Document {
  business: Types.ObjectId;
  status: WhatsAppSessionStatus;
  phone?: string;
  displayName?: string;
  connectedBy?: Types.ObjectId;
  lastConnectedAt?: Date;
  lastDisconnectedAt?: Date;
  lastError?: string;
}

const sessionSchema = new Schema<IWhatsAppSession>(
  {
    business: { type: Schema.Types.ObjectId, ref: "Business", required: true, unique: true },
    status: {
      type: String,
      enum: ["DISCONNECTED", "CONNECTING", "QR", "CONNECTED", "LOGGED_OUT"],
      default: "DISCONNECTED",
      index: true,
    },
    phone: String,
    displayName: String,
    connectedBy: { type: Schema.Types.ObjectId, ref: "User" },
    lastConnectedAt: Date,
    lastDisconnectedAt: Date,
    lastError: String,
  },
  { timestamps: true },
);

export const WhatsAppSession = model<IWhatsAppSession>("WhatsAppSession", sessionSchema);

/* ------------------------------------------------------------------ */
/* Auth state: Baileys credentials + signal keys, AES-256-GCM encrypted */
/* ------------------------------------------------------------------ */

export interface IWhatsAppAuthKey extends Document {
  business: Types.ObjectId;
  key: string;
  value: string;
}

const authKeySchema = new Schema<IWhatsAppAuthKey>(
  {
    business: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    key: { type: String, required: true },
    value: { type: String, required: true },
  },
  { timestamps: true },
);
authKeySchema.index({ business: 1, key: 1 }, { unique: true });

export const WhatsAppAuthKey = model<IWhatsAppAuthKey>("WhatsAppAuthKey", authKeySchema);

/* ------------------------------------------------------------------ */
/* Outbound message log + send queue                                   */
/* ------------------------------------------------------------------ */

export type WhatsAppMessageStatus = "QUEUED" | "SENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "CANCELLED";

export interface IWhatsAppMessage extends Document {
  business: Types.ObjectId;
  lead: Types.ObjectId;
  sentBy: Types.ObjectId;
  to: string;
  body: string;
  template?: Types.ObjectId;
  documents: { documentId?: Types.ObjectId; name: string; storageKey?: string; url?: string; mimeType?: string }[];
  status: WhatsAppMessageStatus;
  waMessageIds: string[];
  error?: string;
  attempts: number;
  nextAttemptAt?: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  createdAt: Date;
}

const messageSchema = new Schema<IWhatsAppMessage>(
  {
    business: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    lead: { type: Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    sentBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    to: { type: String, required: true },
    body: { type: String, default: "", maxlength: 4096 },
    template: { type: Schema.Types.ObjectId, ref: "MessageTemplate" },
    documents: {
      type: [
        {
          documentId: Schema.Types.ObjectId,
          name: String,
          storageKey: String,
          url: String,
          mimeType: String,
        },
      ],
      default: [],
    },
    status: {
      type: String,
      enum: ["QUEUED", "SENDING", "SENT", "DELIVERED", "READ", "FAILED", "CANCELLED"],
      default: "QUEUED",
      index: true,
    },
    waMessageIds: { type: [String], default: [], index: true },
    error: String,
    attempts: { type: Number, default: 0 },
    nextAttemptAt: Date,
    sentAt: Date,
    deliveredAt: Date,
    readAt: Date,
  },
  { timestamps: true },
);
messageSchema.index({ business: 1, status: 1, createdAt: 1 });
messageSchema.index({ business: 1, sentAt: -1 });

export const WhatsAppMessage = model<IWhatsAppMessage>("WhatsAppMessage", messageSchema);

/* ------------------------------------------------------------------ */
/* Message templates                                                    */
/* ------------------------------------------------------------------ */

export interface IMessageTemplate extends Document {
  business: Types.ObjectId;
  name: string;
  body: string;
  defaultDocumentIds: Types.ObjectId[];
  isDefault: boolean;
  createdBy?: Types.ObjectId;
}

const templateSchema = new Schema<IMessageTemplate>(
  {
    business: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    name: { type: String, required: true, maxlength: 80 },
    body: { type: String, required: true, maxlength: 4000 },
    defaultDocumentIds: { type: [Schema.Types.ObjectId], default: [] },
    isDefault: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export const MessageTemplate = model<IMessageTemplate>("MessageTemplate", templateSchema);
