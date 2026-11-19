import { Schema, model, Types, Document } from "mongoose";

/** A user's saved lead-list filter ("Hot leads this week", "My uncontacted", ...). */
export interface ISavedView extends Document {
  user: Types.ObjectId;
  name: string;
  filters: Record<string, string>;
}

const schema = new Schema<ISavedView>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, maxlength: 60 },
    filters: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export const SavedView = model<ISavedView>("SavedView", schema);
