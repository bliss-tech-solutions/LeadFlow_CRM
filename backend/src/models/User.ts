import { Schema, model, Document, Types } from "mongoose";

export type Role = "ADMIN" | "MANAGER" | "SALES" | "BUSINESS";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  business?: Types.ObjectId;
  businessProject?: Types.ObjectId;
  assignedProjects: Types.ObjectId[];
  isActive: boolean;
  dailyLeadLimit: number;
  autoLeadCount: number;
  autoLeadCountDate?: string;
  profilePhotoUrl?: string;
  profilePhotoKey?: string;
  tokenVersion: number;
  lastLoginAt?: Date;
  lastAutoAssignedAt?: Date;
  resetTokenHash?: string;
  resetTokenExpires?: Date;
}

const schema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["ADMIN", "MANAGER", "SALES", "BUSINESS"],
      default: "SALES",
    },
    business: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      index: true,
    },
    businessProject: {
      type: Schema.Types.ObjectId,
      ref: "BusinessProject",
      index: true,
    },
    assignedProjects: {
      type: [{ type: Schema.Types.ObjectId, ref: "BusinessProject" }],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    dailyLeadLimit: {
      type: Number,
      default: 5,
      min: 0,
    },
    autoLeadCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    autoLeadCountDate: String,
    profilePhotoUrl: String,
    profilePhotoKey: String,
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: Date,
    lastAutoAssignedAt: Date,
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
  },
  { timestamps: true },
);

export const User = model<IUser>("User", schema);
