import { addContactFromLead } from "../services/contacts.service";
import { Schema, model, Types, Document } from "mongoose";
import type { City } from "../config/cities";

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
  business?: Types.ObjectId;
  dealValue?: number;
  lostReason?: string;
  isFake?: boolean;
  tags: string[];
  whatsappOptOut: boolean;
  firstContactAt?: Date;
  duplicateOf?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  slaAlertedAt?: Date;
  slaEscalatedAt?: Date;
  lastWhatsAppAt?: Date;
  deliveryStatus: "RELEASED" | "HELD";
  heldUntil?: Date;
  city?: City;
  interestedProduct?: string;
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
    business: { type: Schema.Types.ObjectId, ref: "Business", index: true },
    dealValue: { type: Number, min: 0 },
    lostReason: String,
    isFake: { type: Boolean, default: false, index: true },
    tags: { type: [String], default: [] },
    whatsappOptOut: { type: Boolean, default: false },
    firstContactAt: Date,
    duplicateOf: { type: Schema.Types.ObjectId, ref: "Lead" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    slaAlertedAt: Date,
    slaEscalatedAt: Date,
    lastWhatsAppAt: Date,
    deliveryStatus: {
      type: String,
      enum: ["RELEASED", "HELD"],
      default: "RELEASED",
      index: true,
    },
    heldUntil: Date,
    city: { type: String, index: true },
    interestedProduct: { type: String, index: true },
    score: { type: Number, default: 0 },
    notes: String,
    lastContactAt: Date,
    nextFollowUpAt: Date,
  },
  { timestamps: true },
);

schema.index({ createdAt: -1 });
schema.index({ email: 1, phone: 1 });
schema.index({ phone: 1 });
schema.index({ business: 1, status: 1, createdAt: -1 });
schema.index({ assignedTo: 1, status: 1, createdAt: -1 });
schema.index({ deliveryStatus: 1, assignedTo: 1, createdAt: 1 });

// Every new lead's name + mobile also goes into Contact Data (its own collection).
schema.pre("save", function () {
  this.$locals.wasNew = this.isNew;
});
schema.post("save", function (doc) {
  if (!doc.$locals.wasNew) return;
  void addContactFromLead(doc);
});
schema.post("insertMany", function (docs: any[]) {
  for (const d of docs) void addContactFromLead(d);
});

export const Lead = model<ILead>("Lead", schema);
