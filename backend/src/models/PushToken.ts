import { Schema, model, Document, Types } from "mongoose";

export interface IPushToken extends Document {
  user: Types.ObjectId;
  token: string;
  platform: "ios" | "android" | "web";
  app: "ADMIN" | "SALES" | "ALL";
  deviceName?: string;
  isActive: boolean;
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IPushToken>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ["ios", "android", "web"],
      default: "android",
    },
    app: {
      type: String,
      enum: ["ADMIN", "SALES", "ALL"],
      default: "ALL",
    },
    deviceName: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// Compound index so a user cannot duplicate the exact same device token
schema.index({ user: 1, token: 1 }, { unique: true });

export const PushToken = model<IPushToken>("PushToken", schema);
