import { Schema, model, Document, Types } from "mongoose";

export type SpendLevel = "BUSINESS" | "PROJECT" | "CAMPAIGN" | "AD";

export interface IAdSpend extends Document {
  business: Types.ObjectId;
  project?: Types.ObjectId;
  level: SpendLevel;
  campaignId?: string;
  campaignName?: string;
  adId?: string;
  adName?: string;
  amount: number; // ₹
  periodFrom: Date;
  periodTo: Date;
  note?: string;
  source: "MANUAL" | "META_API";
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IAdSpend>(
  {
    business: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: "BusinessProject", index: true },
    level: {
      type: String,
      enum: ["BUSINESS", "PROJECT", "CAMPAIGN", "AD"],
      required: true,
      index: true,
    },
    campaignId: String,
    campaignName: String,
    adId: String,
    adName: String,
    amount: { type: Number, required: true, min: 0 },
    periodFrom: { type: Date, required: true },
    periodTo: { type: Date, required: true },
    note: String,
    source: { type: String, enum: ["MANUAL", "META_API"], default: "MANUAL" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

schema.index({ business: 1, periodFrom: -1 });
schema.index({ business: 1, project: 1, level: 1 });

export const AdSpend = model<IAdSpend>("AdSpend", schema);
