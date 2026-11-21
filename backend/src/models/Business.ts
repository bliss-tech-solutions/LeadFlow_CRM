import { Schema, model, Document, Types } from "mongoose";
import type { City } from "../config/cities";

export interface IBusiness extends Document {
  name: string;
  state?: string;
  city?: City;
  area?: string;
  pincode?: string;
  detail?: string;
  contactNo?: string;
  leadLimit: number; // 0 = unlimited
  leadLimitType: "DAILY" | "MONTHLY" | "NONE";
  isActive: boolean;
  createdBy?: Types.ObjectId;
  settings: {
    /** Reassign a NEW lead that nobody contacted within N hours (0 = off). */
    autoReassignHours: number;
    /** Minutes before an uncontacted NEW lead raises an SLA alert. */
    slaMinutes: number;
    /** Allow sales staff to send WhatsApp messages through the business number. */
    salesCanSendWhatsApp: boolean;
    /** Daily email digest to the business owner. */
    dailyDigest: boolean;
    /** Lead assignment strategy. */
    assignmentStrategy: "LEAST_LOADED" | "ROUND_ROBIN";
  };
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
    state: { type: String, default: "Gujarat", index: true },
    city: { type: String, index: true },
    area: { type: String, default: "", index: true },
    pincode: { type: String, default: "" },
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
    settings: {
      autoReassignHours: { type: Number, default: 0, min: 0, max: 168 },
      slaMinutes: { type: Number, default: 15, min: 1, max: 1440 },
      salesCanSendWhatsApp: { type: Boolean, default: true },
      dailyDigest: { type: Boolean, default: false },
      assignmentStrategy: { type: String, enum: ["LEAST_LOADED", "ROUND_ROBIN"], default: "LEAST_LOADED" },
    },
  },
  { timestamps: true },
);

export const Business = model<IBusiness>("Business", schema);

