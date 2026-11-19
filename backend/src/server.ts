import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { connectDB } from "./config/db";
import { migrateBusinesses } from "./config/migrateBusinesses";
import { env } from "./config/env";
import { isAllowedOrigin } from "./config/origins";
import { setupSocket } from "./sockets";

import { auth } from "./middleware/auth";
import { requestLogger } from "./middleware/requestLogger";
import { logger } from "./config/logger";

import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import leadRoutes from "./routes/leads";
import followupRoutes from "./routes/followups";
import documentRoutes from "./routes/documents";
import auditRoutes from "./routes/audit";
import metaRoutes from "./routes/meta";
import leadSyncRoutes from "./routes/leadsync";
import notificationRoutes from "./routes/notifications";
import businessRoutes from "./routes/businesses";
import businessProjectRoutes from "./routes/businessProjects";
import leadDeliveryRoutes from "./routes/leadDelivery";
import whatsappRoutes from "./routes/whatsapp";
import analyticsRoutes from "./routes/analytics";
import adminRoutes from "./routes/admin";
import { releaseHeldLeads, assignUnassignedLeads } from "./services/leadDelivery.service";
import { retryFailedWebhookEvents } from "./services/webhookEvents.service";
import { processLeadSla, processAutoReassign, processDailyDigests } from "./services/automation.service";
import { whatsappManager } from "./services/whatsapp/sessionManager";
import { processWhatsAppQueue } from "./services/whatsapp/queue";
import { processFollowupReminders } from "./services/followupReminder.service";
import { startKeepAliveService } from "./services/keepAlive.service";

import { Request, Response, NextFunction } from "express";

export const app = express();

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

const server = http.createServer(app);

const io = setupSocket(server);

app.set("io", io);
whatsappManager.setIO(io);

// Security
app.disable("x-powered-by");
app.use(helmet());

app.set("trust proxy", 1);

app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = isAllowedOrigin(origin);
      return callback(null, allowed);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  }),
);

// Body parser
app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buffer) => {
      (req as Request).rawBody = Buffer.from(buffer);
    },
  }),
);

// Rate limiting
app.use(
  rateLimit({
    windowMs: 60_000,
    max: process.env.NODE_ENV === "production" ? 1000 : 3000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests. Please wait a moment and try again." },
  }),
);

// Request logger
app.use(requestLogger);

// Health check endpoint (both /health and /api/health)
const healthHandler = (_req: Request, res: Response) =>
  res.json({
    ok: true,
    service: "leadflow-crm-api",
    time: new Date().toISOString(),
  });

app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", auth, userRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/followups", followupRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/meta", metaRoutes);
app.use("/api/leadsync", leadSyncRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/businesses", businessRoutes);
app.use("/api/business-projects", businessProjectRoutes);
app.use("/api/lead-delivery", leadDeliveryRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/admin", adminRoutes);

// 404
app.use((_req, res) =>
  res.status(404).json({
    message: "Route not found",
  }),
);

// Error handler
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const error = err instanceof Error ? err : new Error("Unknown error");
  const candidate = err as { statusCode?: number; status?: number; code?: string | number; name?: string } | null;
  let statusCode = candidate?.statusCode ?? candidate?.status ?? 500;
  // Map common Mongoose / body-parser errors to client errors instead of 500s.
  if (error.name === "ValidationError" || error.name === "CastError") statusCode = 400;
  if (candidate?.code === 11000) statusCode = 409;
  if ((err as any)?.type === "entity.parse.failed") statusCode = 400;
  const user = req.user;

  logger.error("Unhandled API Error", {
    method: req.method,
    url: req.originalUrl,
    statusCode,
    errorType: error.name || "UnknownError",
    errorCode: candidate?.code,
    message: error.message || "Internal server error",
    stack: error.stack,
    userId: user?.id,
    userEmail: user?.email,
  });

  res.status(statusCode >= 400 && statusCode <= 599 ? statusCode : 500).json({
    message: candidate?.code === 11000
      ? "This record already exists"
      : statusCode >= 400 && statusCode < 500
        ? error.message
        : "Internal server error",
  });
});

/**
 * Background jobs. Each job is guarded so a slow run never overlaps the next tick.
 * Jobs are idempotent (atomic claims in MongoDB), so running two API instances is
 * safe for everything except WhatsApp sessions (see sessionManager.ts).
 */
function every(name: string, ms: number, fn: () => Promise<unknown>) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } catch (error: any) {
      logger.error(`Background job failed: ${name}`, { error: error?.message, stack: error?.stack });
    } finally {
      busy = false;
    }
  };
  void tick();
  return setInterval(tick, ms);
}

const timers: NodeJS.Timeout[] = [];

function startJobs() {
  // Keep free hosting tiers awake.
  startKeepAliveService();

  // Held-lead release + retry for released-but-unassigned leads (30s).
  timers.push(
    every("lead-delivery", 30_000, async () => {
      await releaseHeldLeads(io);
      await assignUnassignedLeads(io);
    }),
  );

  // Follow-up reminders (atomic claim on reminder24hSentAt prevents duplicates).
  timers.push(every("followup-reminders", 60_000, () => processFollowupReminders(io)));

  // Lead SLA alerts, escalation and auto-reassignment.
  timers.push(
    every("lead-automation", 60_000, async () => {
      await processLeadSla(io);
      await processAutoReassign(io);
      await processDailyDigests();
    }),
  );

  // Retry failed webhook events (transient Graph API / DB errors).
  timers.push(every("webhook-retry", 5 * 60_000, () => retryFailedWebhookEvents(io)));

  // WhatsApp: restore linked devices, then drain the send queue.
  void whatsappManager.restoreAll();
  timers.push(every("whatsapp-queue", 3_000, () => processWhatsAppQueue(io)));
}

process.on("unhandledRejection", (reason: any) => {
  logger.error("Unhandled promise rejection", { error: reason?.message || String(reason), stack: reason?.stack });
});

// Start server
connectDB()
  .then(async () => {
    await migrateBusinesses();
    server.listen(env.PORT, "0.0.0.0", () => {
      logger.info("API server started", {
        port: env.PORT,
        host: "0.0.0.0",
        environment: process.env.NODE_ENV,
      });

      startJobs();
    });
  })
  .catch((err) => {
    logger.error("Failed to start API server", {
      error: err?.message,
      stack: err?.stack,
    });

    process.exitCode = 1;
  });

const shutdown = (signal: string) => {
  logger.info("Shutting down API server", { signal });
  timers.forEach(clearInterval);
  void whatsappManager.shutdown();
  server.close(() => {
    void import("mongoose").then(({ default: mongoose }) => mongoose.disconnect())
      .catch((error: unknown) => {
        logger.error("Error during MongoDB shutdown", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      })
      .finally(() => process.exit(0));
  });
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
