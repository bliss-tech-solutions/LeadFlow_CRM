import { logger } from "../config/logger";
import { env } from "../config/env";

const KEEP_ALIVE_INTERVAL_MS = 9 * 60 * 1000; // 9 minutes

/**
 * Resolve the public or local health check URL.
 * Automatically recognizes Render, Railway, custom BACKEND_URL, or falls back to local loopback.
 */
export function getHealthCheckUrl(): string {
  const customBackendUrl =
    process.env.BACKEND_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.HOSTING_URL ||
    process.env.API_URL;

  if (customBackendUrl && customBackendUrl.trim()) {
    let clean = customBackendUrl.trim().replace(/\/+$/, "");
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
      clean = `https://${clean}`;
    }
    if (!clean.endsWith("/health") && !clean.endsWith("/api/health")) {
      clean = `${clean}/health`;
    }
    return clean;
  }

  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL;
  if (railwayDomain && railwayDomain.trim()) {
    let clean = railwayDomain.trim().replace(/\/+$/, "");
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
      clean = `https://${clean}`;
    }
    return `${clean}/health`;
  }

  const port = env.PORT || 4000;
  return `http://127.0.0.1:${port}/health`;
}

/**
 * Execute a single keep-alive ping to ensure the server remains awake.
 */
export async function pingHealthCheck(): Promise<boolean> {
  const url = getHealthCheckUrl();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "LeadFlow-CRM-KeepAlive/1.0",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok) {
      logger.info("Keep-alive health check ping successful", {
        url,
        status: res.status,
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    logger.warn("Keep-alive health check responded with non-200 status", {
      url,
      status: res.status,
    });
    return false;
  } catch (error: any) {
    logger.warn("Keep-alive health check ping failed", {
      url,
      error: error?.message || "Unknown network error",
    });
    return false;
  }
}

/**
 * Start the recurring 9-minute background keep-alive worker.
 */
export function startKeepAliveService(): NodeJS.Timeout {
  logger.info("Starting keep-alive service (every 9 minutes to prevent cold starts)", {
    targetUrl: getHealthCheckUrl(),
    intervalMinutes: 9,
  });

  // Run the keep-alive ping on every 9-minute interval
  const timer = setInterval(() => {
    void pingHealthCheck();
  }, KEEP_ALIVE_INTERVAL_MS);

  return timer;
}

