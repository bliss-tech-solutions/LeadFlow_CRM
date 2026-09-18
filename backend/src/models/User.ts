import { Schema, model, Document } from "mongoose";

export type Role = "ADMIN" | "MANAGER" | "SALES";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  dailyLeadLimit: number;
  autoLeadCount: number;
  autoLeadCountDate?: string;
}

const schema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["ADMIN", "MANAGER", "SALES"],
      default: "SALES",
    },
    isActive: { type: Boolean, default: true },
    dailyLeadLimit: { type: Number, default: 5, min: 0 },
    autoLeadCount: { type: Number, default: 0, min: 0 },
    autoLeadCountDate: String,
  },
  { timestamps: true },
);

export const User = model<IUser>("User", schema);
