import { Schema, model, Types, Document } from "mongoose";

export interface INote extends Document {
  lead: Types.ObjectId;
  author: Types.ObjectId;
  body: string;
  mentions: Types.ObjectId[];
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<INote>(
  {
    lead: { type: Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, maxlength: 4000 },
    mentions: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true },
);

schema.index({ lead: 1, createdAt: -1 });

export const Note = model<INote>("Note", schema);
