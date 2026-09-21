import { Schema, model, Document } from "mongoose";

export interface ILeadDeliverySchedule extends Document {
  enabled: boolean;
  holdFrom?: Date;
  holdUntil?: Date;
  holdStart?: string;
  holdEnd?: string;
  timezone: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ILeadDeliverySchedule>(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    holdFrom: Date,
    holdUntil: Date,
    holdStart: {
      type: String,
      default: "22:00",
    },
    holdEnd: {
      type: String,
      default: "10:00",
    },
    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },
    updatedBy: String,
  },
  { timestamps: true },
);

export const LeadDeliverySchedule = model<ILeadDeliverySchedule>(
  "LeadDeliverySchedule",
  schema,
);
