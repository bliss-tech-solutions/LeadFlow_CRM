import { Schema, model, Document, Types } from "mongoose";

export interface IBusiness extends Document {
  name: string;
  detail?: string;
  contactNo?: string;
  leadLimit: number; // 0 = unlimited
  leadLimitType: "DAILY" | "MONTHLY" | "NONE";
  isActive: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IBusiness>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    detail: {
      type: String,
      default: "",
    },
    contactNo: {
      type: String,
      default: "",
    },
    leadLimit: {
      type: Number,
      default: 0,
      min: 0,
    },
    leadLimitType: {
      type: String,
      enum: ["DAILY", "MONTHLY", "NONE"],
      default: "NONE",
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

export const Business = model<IBusiness>("Business", schema);

