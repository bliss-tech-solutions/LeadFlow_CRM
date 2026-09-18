import { Schema, model, Types, Document } from "mongoose";
export interface ICall extends Document {
  lead: Types.ObjectId;
  user: Types.ObjectId;
  result: string;
  durationSec?: number;
  notes?: string;
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
}
const schema = new Schema<ICall>(
  {
    lead: { type: Schema.Types.ObjectId, ref: "Lead", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    result: { type: String, required: true },
    durationSec: Number,
    notes: String,
    startedAt: Date,
    endedAt: Date,
  },
  { timestamps: true },
);
export const Call = model<ICall>("Call", schema);
