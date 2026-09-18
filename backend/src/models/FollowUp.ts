import { Schema, model, Types, Document } from "mongoose";
export interface IFollowUp extends Document {
  lead: Types.ObjectId;
  user: Types.ObjectId;
  type: string;
  scheduledAt: Date;
  notes?: string;
  status: string;
  completedAt?: Date;
  createdAt: Date;
}
const schema = new Schema<IFollowUp>(
  {
    lead: {
      type: Schema.Types.ObjectId,
      ref: "Lead",
      required: true,
      index: true,
    },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, default: "CALL" },
    scheduledAt: { type: Date, required: true, index: true },
    notes: String,
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "MISSED", "CANCELLED"],
      default: "PENDING",
    },
    completedAt: Date,
  },
  { timestamps: true },
);
export const FollowUp = model<IFollowUp>("FollowUp", schema);
