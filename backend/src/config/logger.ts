import winston from "winston";

const { combine, timestamp, json, errors, colorize, simple } = winston.format;
const isProduction = process.env.NODE_ENV === "production";

const transports: winston.transport[] = [
  new winston.transports.Console({
    level: "info",
    format: isProduction
      ? combine(timestamp(), json())
      : combine(colorize(), timestamp(), simple()),
  }),
];

// Local development keeps file logs for convenience. Production platforms
// should receive logs on stdout/stderr so their log aggregation works and
// ephemeral containers do not depend on a writable logs directory.
if (!isProduction) {
  transports.push(
    new winston.transports.File({ filename: "logs/combined.log", level: "info" }),
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
  );
}

export const logger = winston.createLogger({
  level: isProduction ? "info" : "debug",
  defaultMeta: { service: "leadflow-crm-api" },
  format: combine(timestamp(), errors({ stack: true }), json()),
  transports,
  exitOnError: false,
});
