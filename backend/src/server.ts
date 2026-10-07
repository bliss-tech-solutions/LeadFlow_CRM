import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { connectDB } from "./config/db";
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
import notificationRoutes from "./routes/notifications";
import businessProjectRoutes from "./routes/businessProjects";
import leadDeliveryRoutes from "./routes/leadDelivery";
import { releaseHeldLeads } from "./services/leadDelivery.service";
import { processFollowupReminders } from "./services/followupReminder.service";

import { Request, Response, NextFunction } from "express";

const app = express();

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

const allowedOrigins = env.FRONTEND_URL.split(",").map((value) => value.trim()).filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin is not allowed by CRM CORS policy"));
    },
    credentials: true,
  }),
);

// Body parser
app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buffer) => {
      req.rawBody = Buffer.from(buffer);
    },
  }),
);

// Rate limiting
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// Request logger
app.use(requestLogger);

// Health
app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    service: "leadflow-crm-api",
    time: new Date().toISOString(),
  }),
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", auth, userRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/followups", followupRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/meta", metaRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/business-projects", businessProjectRoutes);
app.use("/api/lead-delivery", leadDeliveryRoutes);

// 404
app.use((_req, res) =>
  res.status(404).json({
    message: "Route not found",
  }),
);

// Error handler
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const user = (req as any).user;

  logger.error("Unhandled API Error", {
    method: req.method,
    url: req.originalUrl,
    statusCode: err?.statusCode || 500,
    errorType: err?.name || "UnknownError",
    errorCode: err?.code,
    message: err?.message || "Internal server error",
    stack: err?.stack,
    userId: user?.id || user?._id,
    userEmail: user?.email,
  });

  res.status(err?.statusCode || 500).json({
    message:
      err?.statusCode && err.statusCode < 500
        ? err.message
        : "Internal server error",
  });
});

// Start server
connectDB()
  .then(() =>
    server.listen(env.PORT, () => {
      logger.info("API server started", {
        port: env.PORT,
        environment: process.env.NODE_ENV,
      });

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
    }),
  )
  .catch((err) => {
    logger.error("Failed to start API server", {
      error: err?.message,
      stack: err?.stack,
    });

    process.exit(1);
  });
  