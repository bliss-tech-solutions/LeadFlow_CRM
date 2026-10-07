import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { logger } from "../config/logger";

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const start = process.hrtime.bigint();

  const requestId =
    req.headers["x-request-id"]?.toString() ||
    crypto.randomUUID();

  res.setHeader("X-Request-ID", requestId);

  res.on("finish", () => {
    const duration =
      Number(process.hrtime.bigint() - start) / 1_000_000;

    const statusCode = res.statusCode;

    const user = (req as any).user;

    const logData = {
    //   requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode,
      status:
        statusCode >= 500
          ? "error"
          : statusCode >= 400
            ? "warning"
            : "success",

      duration: `${duration.toFixed(2)}ms`,

      // ip:
      //   req.headers["x-forwarded-for"]
      //     ?.toString()
      //     .split(",")[0]
      //     .trim() ||
      //   req.socket.remoteAddress,

    //   userAgent: req.get("user-agent"),

    //   userId: user?.id || user?._id || undefined,

    //   userEmail: user?.email || undefined,
    };

    if (statusCode >= 500) {
      logger.error("API Request", logData);
    } else if (statusCode === 401 || statusCode === 403) {
      // Expected auth/permission responses are useful for diagnostics but
      // should not look like server failures in production logs.
      logger.info("API Request", { ...logData, status: "auth" });
    } else if (statusCode >= 400) {
      logger.warn("API Request", logData);
    } else {
      logger.http("API Request", logData);
    }
  });

  next();
};