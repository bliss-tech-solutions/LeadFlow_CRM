import { Schema, model, Types, Document } from "mongoose";
export interface IActivity extends Document {
  lead: Types.ObjectId;
  actor?: Types.ObjectId;
  type: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}
const schema = new Schema<IActivity>(
  {
    lead: {
      type: Schema.Types.ObjectId,
      ref: "Lead",
      required: true,
      index: true,
    },
    actor: { type: Schema.Types.ObjectId, ref: "User" },
    type: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: String,
    metadata: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
export const Activity = model<IActivity>("Activity", schema);
