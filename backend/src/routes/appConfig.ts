import { Router } from "express";
import { env } from "../config/env";

const r = Router();

/** Compare dotted versions: returns -1, 0, 1. */
export function compareVersions(a: string, b: string) {
  const pa = String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * GET /api/app/config?app=admin|partner&version=1.0.0
 * Public bootstrap info for the mobile apps: forced-update and maintenance flags.
 */
r.get("/config", (req, res) => {
  const app = req.query.app === "admin" ? "admin" : "partner";
  const version = String(req.query.version || "0.0.0");
  const min = app === "admin" ? env.APP_MIN_VERSION_ADMIN : env.APP_MIN_VERSION_PARTNER;
  const latest = app === "admin" ? env.APP_LATEST_VERSION_ADMIN : env.APP_LATEST_VERSION_PARTNER;
  res.set("Cache-Control", "public, max-age=300");
  res.json({
    app,
    minSupportedVersion: min,
    latestVersion: latest,
    updateRequired: compareVersions(version, min) < 0,
    updateAvailable: compareVersions(version, latest) < 0,
    maintenance: env.APP_MAINTENANCE,
    maintenanceMessage: env.APP_MAINTENANCE ? "LeadFlow is being upgraded. Please try again in a few minutes." : undefined,
    whatsappEnabled: env.WA_ENABLED,
    supportEmail: env.SUPPORT_EMAIL,
    storeUrls: {
      android: app === "admin" ? env.STORE_URL_ANDROID_ADMIN : env.STORE_URL_ANDROID_PARTNER,
      ios: app === "admin" ? env.STORE_URL_IOS_ADMIN : env.STORE_URL_IOS_PARTNER,
    },
  });
});

export default r;
