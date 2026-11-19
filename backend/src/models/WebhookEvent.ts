import { Schema, model, Types, Document } from "mongoose";

/**
 * Durable log of every inbound lead webhook. The raw event is stored BEFORE
 * processing so a failed ingestion (Graph API outage, bug, DB blip) can be
 * inspected and replayed instead of being lost.
 */
export interface IWebhookEvent extends Document {
  source: "META" | "LEADSYNC" | "TEST";
  leadgenId?: string;
  pageId?: string;
  formId?: string;
  payload: Record<string, unknown>;
  status: "RECEIVED" | "PROCESSED" | "DUPLICATE" | "FAILED";
  error?: string;
  attempts: number;
  lead?: Types.ObjectId;
  processedAt?: Date;
  createdAt: Date;
}

const schema = new Schema<IWebhookEvent>(
  {
    source: { type: String, enum: ["META", "LEADSYNC", "TEST"], required: true, index: true },
    leadgenId: { type: String, index: true },
    pageId: String,
    formId: String,
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ["RECEIVED", "PROCESSED", "DUPLICATE", "FAILED"],
      default: "RECEIVED",
      index: true,
    },
    error: String,
    attempts: { type: Number, default: 0 },
    lead: { type: Schema.Types.ObjectId, ref: "Lead" },
    processedAt: Date,
  },
  { timestamps: true },
);

// Keep 90 days of webhook history.
schema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const WebhookEvent = model<IWebhookEvent>("WebhookEvent", schema);
