import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  MONGO_URI: z.string().default("mongodb://127.0.0.1:27017/leadflow_crm"),
  MONGO_DB_NAME: z.string().default("leadflow_crm"),
  JWT_SECRET: z.string().default("dev-secret-change-me"),
  JWT_EXPIRES_IN: z.string().default("1d"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  META_VERIFY_TOKEN: z.string().default("leadflow-demo-token"),
  META_APP_SECRET: z.string().optional(),
  META_ACCESS_TOKEN: z.string().optional(),
  META_GRAPH_VERSION: z.string().optional(),
  META_LEAD_FETCH_URL: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_PRESIGN_EXPIRES: z.coerce.number().default(900),
});

export const env = schema.parse(process.env);

if (env.NODE_ENV === "production") {
  if (env.MONGO_URI === "mongodb://127.0.0.1:27017/leadflow_crm") {
    throw new Error("MONGO_URI must be configured for production");
  }
  if (env.JWT_SECRET === "dev-secret-change-me" || env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be a strong 32+ character secret in production");
  }
  if (env.META_VERIFY_TOKEN === "leadflow-demo-token") {
    throw new Error("META_VERIFY_TOKEN must be configured for production");
  }
  if (!env.META_APP_SECRET || env.META_APP_SECRET.length < 16) {
    throw new Error("META_APP_SECRET must be configured to verify Meta webhook signatures in production");
  }
  if (!env.FRONTEND_URL.trim()) {
    throw new Error("FRONTEND_URL must contain the allowed production frontend origin(s)");
  }
  if (env.PORT < 1 || env.PORT > 65535) {
    throw new Error("PORT must be between 1 and 65535");
  }
}
