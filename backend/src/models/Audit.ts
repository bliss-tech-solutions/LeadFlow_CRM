import { Schema, model, Types, Document } from "mongoose";

export interface IAudit extends Document {
  actor?: Types.ObjectId;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  createdAt: Date;
}

const schema = new Schema<IAudit>(
  {
    actor: { type: Schema.Types.ObjectId, ref: "User" },
    action: String,
    entity: String,
    entityId: String,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);


export const Audit = model<IAudit>("Audit", schema);
