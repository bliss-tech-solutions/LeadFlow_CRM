import { Types } from "mongoose";
import { Activity } from "../models/Activity";

export async function logActivity(input: {
  lead: string | any;
  actor?: string;
  type: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
}) {
  return Activity.create({
    lead: new Types.ObjectId(input.lead),
    actor: input.actor ? new Types.ObjectId(input.actor) : undefined,
    type: input.type,
    title: input.title,
    description: input.description,
    metadata: input.metadata,
  });
}
