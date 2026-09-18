import { Schema, model, Document, Types } from "mongoose";

export interface INotification extends Document {
  user: Types.ObjectId;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, default: "SYSTEM", index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    entityType: String,
    entityId: String,
    readAt: Date,
  },
  { timestamps: true },
);

schema.index({ user: 1, readAt: 1, createdAt: -1 });

export const Notification = model<INotification>("Notification", schema);
