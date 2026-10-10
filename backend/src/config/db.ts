import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "./logger";

let connectionPromise: Promise<typeof mongoose> | null = null;

/** Connect once per process. Startup must fail when MongoDB is unavailable. */
export async function connectDB(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connectionPromise) return connectionPromise;

  connectionPromise = mongoose.connect(env.MONGO_URI, {
    dbName: env.MONGO_DB_NAME,
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
    minPoolSize: 0,
    autoIndex: env.NODE_ENV !== "production",
  }).then((connection) => {
    logger.info("MongoDB connected", { database: connection.connection.name });
    return connection;
  }).catch((error: unknown) => {
    connectionPromise = null;
    logger.error("MongoDB connection failed", {
      error: error instanceof Error ? error.message : "Unknown database error",
    });
    throw error;
  });

  return connectionPromise;
}
