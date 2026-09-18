import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config/env";
let queue: Queue | undefined;
export function getLeadQueue() {
  if (!queue) {
    const connection = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    queue = new Queue("lead-ingestion", { connection });
  }
  return queue;
}
