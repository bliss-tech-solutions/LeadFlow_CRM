import crypto from "crypto";
import { env } from "../config/env";

/**
 * AES-256-GCM helpers for secrets stored at rest (WhatsApp session credentials).
 * The key is derived from WA_ENCRYPTION_KEY (required in production), falling
 * back to JWT_SECRET in development so local setups work out of the box.
 */
let cachedKey: Buffer | null = null;

function getKey() {
  if (!cachedKey) {
    const secret = env.WA_ENCRYPTION_KEY || env.JWT_SECRET;
    cachedKey = crypto.createHash("sha256").update(`leadflow-wa:${secret}`).digest();
  }
  return cachedKey;
}

export function encryptString(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptString(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) throw new Error("Unsupported encrypted payload");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
