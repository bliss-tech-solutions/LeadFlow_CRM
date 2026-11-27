import { Schema, model, Types, Document } from "mongoose";

export type FollowUpStatus =
  | "PENDING"
  | "COMPLETED"
  | "MISSED"
  | "CANCELLED"
  | "RESCHEDULED";

export interface IFollowUp extends Document {
  lead: Types.ObjectId;
  user: Types.ObjectId;
  type: string;
  scheduledAt: Date;
  notes?: string;
  status: FollowUpStatus;
  completedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  rescheduledAt?: Date;
  rescheduledFrom?: Types.ObjectId;
  reminderAt?: Date;
  reminder24hSentAt?: Date;
  reminder15mSentAt?: Date;
  reminderDueSentAt?: Date;
  outcomeNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IFollowUp>(
  {
    lead: {
      type: Schema.Types.ObjectId,
      ref: "Lead",
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: { type: String, default: "CALL" },
    scheduledAt: { type: Date, required: true, index: true },
    notes: String,
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "MISSED", "CANCELLED", "RESCHEDULED"],
      default: "PENDING",
      index: true,
    },
    completedAt: Date,
    cancelledAt: Date,
    cancellationReason: String,
    rescheduledAt: Date,
    rescheduledFrom: { type: Schema.Types.ObjectId, ref: "FollowUp" },
    reminderAt: { type: Date, index: true },
    reminder24hSentAt: Date,
    reminder15mSentAt: Date,
    reminderDueSentAt: Date,
    outcomeNote: String,
  },
  { timestamps: true },
);

schema.index({ status: 1, reminderAt: 1, reminder24hSentAt: 1 });
schema.index({ status: 1, scheduledAt: 1, reminder15mSentAt: 1 });
schema.index({ status: 1, scheduledAt: 1 });
schema.index({ user: 1, status: 1, scheduledAt: 1 });
schema.index({ updatedAt: -1 });

export const FollowUp = model<IFollowUp>("FollowUp", schema);
