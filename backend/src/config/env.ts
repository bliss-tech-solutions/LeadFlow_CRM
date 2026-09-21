import "dotenv/config";
import { z } from "zod";


const schema = z.object({
  PORT: z.coerce.number().default(4000),
  MONGO_URI: z.string().default("mongodb://127.0.0.1:27017/leadflow_crm"),
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
