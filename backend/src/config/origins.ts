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

export const allowedOrigins = Array.from(new Set([...(isProduction ? [] : devOrigins), ...envOrigins]));

/**
 * Shared origin check for Express CORS and Socket.IO.
 *
 * - Requests WITHOUT an Origin header are allowed: the iOS/Android apps, curl and
 *   server-to-server webhooks never send one. CORS is a browser-only protection;
 *   API access itself is always guarded by the Bearer token.
 * - Development: any origin (Expo web, LAN IPs, emulators, tunnels).
 * - Production: only the website origins listed in FRONTEND_URL. LAN IPs, tunnels,
 *   file:// and "null" origins are rejected so other web pages cannot call the API
 *   from a user's browser.
 */
export function isAllowedOrigin(origin?: string | null): boolean {
  if (!origin) return true;
  if (!isProduction) return true;
  const clean = String(origin).trim().replace(/\/$/, "");
  return allowedOrigins.includes(clean);
}
