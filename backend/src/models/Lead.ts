import { Schema, model, Types, Document } from "mongoose";

export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "INTERESTED"
  | "FOLLOW_UP"
  | "SCHEDULED"
  | "WON"
  | "LOST"
  | "NOT_INTERESTED";

export interface ILead extends Document {
  name: string;
  email?: string;
  phone?: string;
  source: string;
  campaign?: string;
  formName?: string;
  metaLeadId?: string;
  meta?: {
    fieldData?: Array<{ name: string; values: string[] }>;
    formData?: Record<string, unknown>;
    rawPayload?: Record<string, unknown>;
    businessId?: string;
    pageId?: string;
    pageName?: string;
    formName?: string;
    adAccountId?: string;
    campaignId?: string;
    adSetId?: string;
    adId?: string;
    formId?: string;
    createdTime?: Date;
  };
  status: LeadStatus;
  contactStatus?: string;
  assignedTo?: Types.ObjectId;
  assignedAt?: Date;
  assignmentSource?: "AUTO" | "MANUAL";
  businessProject?: Types.ObjectId;
  deliveryStatus: "RELEASED" | "HELD";
  heldUntil?: Date;
  score: number;
  notes?: string;
  lastContactAt?: Date;
  nextFollowUpAt?: Date;
  createdAt: Date;
}

const schema = new Schema<ILead>(
  {
    name: {
      type: String,
      required: true,
    },
    email: String,
    phone: String,
    source: {
      type: String,
      default: "MANUAL",
    },
    campaign: String,
    formName: String,
    metaLeadId: {
      type: String,
      index: true,
      sparse: true,
      unique: true,
    },

    meta: {
      fieldData: {
        type: [
          {
            name: String,
            values: [String],
          },
        ],
        default: [],
      },
      formData: {
        type: Schema.Types.Mixed,
        default: null,
      },
      rawPayload: {
        type: Schema.Types.Mixed,
        default: null,
      },
      businessId: String,
      pageId: String,
      pageName: String,
      formName: String,
      adAccountId: String,
      campaignId: String,
      adSetId: String,
      adId: String,
      formId: String,
      createdTime: Date,
    },

    status: {
      type: String,
      enum: [
        "NEW",
        "CONTACTED",
        "INTERESTED",
        "FOLLOW_UP",
        "SCHEDULED",
        "WON",
        "LOST",
        "NOT_INTERESTED",
      ],
      default: "NEW",
      index: true,
    },
    contactStatus: String,
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", index: true },
    assignedAt: Date,
    assignmentSource: { type: String, enum: ["AUTO", "MANUAL"] },
    businessProject: {
      type: Schema.Types.ObjectId,
      ref: "BusinessProject",
      index: true,
    },
    deliveryStatus: {
      type: String,
      enum: ["RELEASED", "HELD"],
      default: "RELEASED",
      index: true,
    },
    heldUntil: Date,
    score: { type: Number, default: 0 },
    notes: String,
    lastContactAt: Date,
    nextFollowUpAt: Date,
  },
  { timestamps: true },
);

schema.index({ createdAt: -1 });
schema.index({ email: 1, phone: 1 });

export const Lead = model<ILead>("Lead", schema);
