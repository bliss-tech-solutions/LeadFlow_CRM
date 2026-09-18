import { Schema, model, Types, Document } from "mongoose";
export interface ILeadDocument extends Document {
  lead?: Types.ObjectId;
  businessProject?: Types.ObjectId;
  uploadedBy: Types.ObjectId;
  name: string;
  url: string;
  mimeType?: string;
  size?: number;
  sharedAt?: Date;
  openedAt?: Date;
}
const schema = new Schema<ILeadDocument>(
  {
    lead: { type: Schema.Types.ObjectId, ref: "Lead" },
    businessProject: { type: Schema.Types.ObjectId, ref: "BusinessProject", index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: String,
    url: String,
    mimeType: String,
    size: Number,
    sharedAt: Date,
    openedAt: Date,
  },
  { timestamps: true },
);
export const LeadDocument = model<ILeadDocument>("LeadDocument", schema);
