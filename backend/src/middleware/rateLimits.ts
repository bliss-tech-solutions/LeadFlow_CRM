import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const isProd = process.env.NODE_ENV === "production";

/** Brute-force protection for login: keyed by IP + email. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: isProd ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${ipKeyGenerator(req.ip ?? "")}:${String(req.body?.email ?? "").trim().toLowerCase()}`,
  message: { message: "Too many sign-in attempts. Please wait 15 minutes and try again." },
});

/** Password reset requests. */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: isProd ? 5 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many password reset requests. Please try again later." },
});

/** Inbound webhooks (Meta / LeadSync). Generous, but caps abuse. */
export const webhookLimiter = rateLimit({
  windowMs: 60_000,
  max: isProd ? 600 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many webhook requests" },
});

/** WhatsApp send endpoints, per user. */
export const whatsappSendLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String((req as any).user?.id ?? ipKeyGenerator(req.ip ?? "")),
  message: { message: "You are sending WhatsApp messages too quickly. Please slow down." },
});
