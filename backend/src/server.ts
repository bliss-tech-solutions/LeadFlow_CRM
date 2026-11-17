import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { connectDB } from "./config/db";
import { migrateBusinesses } from "./config/migrateBusinesses";
import { env } from "./config/env";
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
import { releaseHeldLeads } from "./services/leadDelivery.service";
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

// Security
app.use(helmet());

const defaultAllowedOrigins = [
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

const allowedOrigins = Array.from(new Set([...defaultAllowedOrigins, ...envOrigins]));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.trim().replace(/\/$/, "");
      if (
        allowedOrigins.includes(cleanOrigin) ||
        cleanOrigin.endsWith(".trycloudflare.com")
      ) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not allowed by CRM CORS policy`));
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

// 404
app.use((_req, res) =>
  res.status(404).json({
    message: "Route not found",
  }),
);

// Error handler
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const error = err instanceof Error ? err : new Error("Unknown error");
  const candidate = err as { statusCode?: number; status?: number; code?: string } | null;
  const statusCode = candidate?.statusCode ?? candidate?.status ?? 500;
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
    message: statusCode >= 400 && statusCode < 500
      ? error.message
      : "Internal server error",
  });
});

// Start server
connectDB()
  .then(async () => {
    await migrateBusinesses();
    server.listen(env.PORT, () => {
      logger.info("API server started", {
        port: env.PORT,
        environment: process.env.NODE_ENV,
      });

      // Start 9-minute background keep-alive service to prevent hosting cold sleep
      startKeepAliveService();

      // Check every 30 seconds so held leads are released within the next minute.
      const release = () => {
        releaseHeldLeads(io).catch((error) => {
          logger.error("Failed to release held leads", {
            error: error?.message,
          });
        });
      };

      release();
      setInterval(release, 30_000);

      const followupMaintenance = async () => {
        try {
          await processFollowupReminders(io);
        } catch (error: any) {
          logger.error("Follow-up maintenance failed", {
            error: error?.message,
          });
        }
      };

      // Follow-up reminders run every minute. MongoDB's atomic claim
      // (reminder24hSentAt) prevents duplicate reminders across instances.
      void followupMaintenance();
      setInterval(followupMaintenance, 60 * 1000);
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
