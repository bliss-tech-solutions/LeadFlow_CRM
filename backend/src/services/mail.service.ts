import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";
import { logger } from "../config/logger";

let transporter: Transporter | null = null;

export function isMailConfigured() {
  return Boolean(env.SMTP_HOST);
}

function getTransporter() {
  if (!env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

/**
 * Send a transactional email. When SMTP is not configured the message is
 * logged in development (so flows can be tested locally) and dropped in production.
 */
export async function sendMail(input: { to: string; subject: string; text: string; html?: string }) {
  const t = getTransporter();
  if (!t) {
    if (env.NODE_ENV !== "production") {
      logger.info("[mail] SMTP not configured — email not sent (dev preview)", {
        to: input.to,
        subject: input.subject,
        text: input.text,
      });
    } else {
      logger.warn("[mail] SMTP not configured — email dropped", { subject: input.subject });
    }
    return false;
  }
  await t.sendMail({ from: env.SMTP_FROM, ...input });
  return true;
}
