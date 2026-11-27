import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  MONGO_URI: z.string().default("mongodb://127.0.0.1:27017/leadflow_crm_test"),
  MONGO_DB_NAME: z.string().default("leadflow_crm_test"),
  JWT_SECRET: z.string().default("dev-secret-change-me"),
  JWT_EXPIRES_IN: z.string().default("1d"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  META_VERIFY_TOKEN: z.string().default("leadflow-demo-token"),
  LEADSYNC_WEBHOOK_SECRET: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_ACCESS_TOKEN: z.string().optional(),
  META_GRAPH_VERSION: z.string().optional(),
  META_LEAD_FETCH_URL: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_PRESIGN_EXPIRES: z.coerce.number().default(900),

  // Outbound email (password reset, digests). Optional: when unset, emails are logged in development only.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("LeadFlow CRM <no-reply@leadflow.local>"),

  // SMS (MSG91 Flow API). Templates must be DLT-approved and created in MSG91 first.
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_API_URL: z.string().default("https://control.msg91.com/api/v5/flow"),
  /** Shared secret in the delivery-report webhook URL: /api/outreach/sms/webhook?token=... */
  SMS_WEBHOOK_TOKEN: z.string().optional(),
  /** Google Sheet (link or ID) that fills the "demodata" collection used by the Data scraping demo. */
  SCRAPE_SHEET_URL: z
    .string()
    .default("https://docs.google.com/spreadsheets/d/1V8ZLhe8MkA5CPMT3_wM2st5spV5wo9DPJ-e0Hx-JDhk/edit?gid=0"),

  // WhatsApp (QR-linked device via Baileys)
  WA_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false" && v !== "0"),
  WA_ENCRYPTION_KEY: z.string().optional(),
  WA_DAILY_LIMIT: z.coerce.number().default(150),
  WA_MIN_GAP_MS: z.coerce.number().default(4000),
  WA_MAX_GAP_MS: z.coerce.number().default(9000),
  WA_DEFAULT_COUNTRY_CODE: z.string().default("91"),

  // Lead SLA: minutes before an uncontacted NEW lead raises an alert.
  LEAD_SLA_MINUTES: z.coerce.number().default(15),

  // Mobile apps: forced update / maintenance (see routes/appConfig.ts)
  APP_MIN_VERSION_ADMIN: z.string().default("1.0.0"),
  APP_MIN_VERSION_PARTNER: z.string().default("1.0.0"),
  APP_LATEST_VERSION_ADMIN: z.string().default("1.0.0"),
  APP_LATEST_VERSION_PARTNER: z.string().default("1.0.0"),
  APP_MAINTENANCE: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  SUPPORT_EMAIL: z.string().default("support@leadflow.app"),
  STORE_URL_ANDROID_ADMIN: z.string().optional(),
  STORE_URL_ANDROID_PARTNER: z.string().optional(),
  STORE_URL_IOS_ADMIN: z.string().optional(),
  STORE_URL_IOS_PARTNER: z.string().optional(),
  /** Optional: Expo access token if "Enhanced push security" is enabled in EAS. */
  EXPO_ACCESS_TOKEN: z.string().optional(),

  // Optional error tracking
  SENTRY_DSN: z.string().optional(),
});

export const env = schema.parse(process.env);

if (env.NODE_ENV === "production") {
  if (!process.env.MONGO_URI) {
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
  if (env.WA_ENABLED && (!env.WA_ENCRYPTION_KEY || env.WA_ENCRYPTION_KEY.length < 32)) {
    throw new Error("WA_ENCRYPTION_KEY must be a 32+ character secret in production (or set WA_ENABLED=false)");
  }
  if (env.PORT < 1 || env.PORT > 65535) {
    throw new Error("PORT must be between 1 and 65535");
  }
}

/** First configured frontend origin, used to build links in emails. */
export const appUrl = (env.FRONTEND_URL.split(",")[0] || "http://localhost:3000").trim().replace(/\/$/, "");
