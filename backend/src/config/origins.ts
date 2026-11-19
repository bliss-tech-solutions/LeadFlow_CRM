import { env } from "./env";

const devOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:4000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4000",
];

const envOrigins = (env.FRONTEND_URL || "")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

const isProduction = env.NODE_ENV === "production";

export const allowedOrigins = Array.from(
  new Set([...(isProduction ? [] : devOrigins), ...envOrigins]),
);

/**
 * Shared origin check for Express CORS and Socket.IO.
 * In development / testing, allows all origins (Expo, local Wi-Fi, emulators).
 */
export function isAllowedOrigin(origin?: string | null): boolean {
  // Native mobile apps, Expo Go, curl, Postman don't send origin or send "null" / "undefined"
  if (!origin || origin === "null" || origin === "undefined") return true;

  // In non-production, allow all LAN, Wi-Fi, Expo Go and localhost origins
  if (!isProduction) return true;

  const clean = String(origin).trim().replace(/\/$/, "");
  if (allowedOrigins.includes(clean)) return true;
  if (clean.endsWith(".trycloudflare.com") || clean.endsWith(".ngrok-free.app")) return true;
  if (
    clean.startsWith("exp://") ||
    clean.startsWith("capacitor://") ||
    clean.startsWith("ionic://") ||
    clean.startsWith("file://")
  ) {
    return true;
  }
  if (
    /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(
      clean,
    )
  ) {
    return true;
  }
  return false;
}
