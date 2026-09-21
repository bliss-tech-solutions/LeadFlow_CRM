import winston from "winston";

const { combine, timestamp, json, errors, colorize, simple } = winston.format;

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",

  defaultMeta: {
    service: "leadflow-crm-api",
  },

  format: combine(timestamp(), errors({ stack: true }), json()),

  transports: [
    // All logs
    new winston.transports.File({
      filename: "logs/combined.log",
      level: "info",
    }),

    // Only errors
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
    }),

    // Console
    new winston.transports.Console({
      format:
        process.env.NODE_ENV === "production"
          ? combine(timestamp(), json())
          : combine(colorize(), timestamp(), simple()),
    }),
  ],

  exceptionHandlers: [
    new winston.transports.File({
      filename: "logs/exceptions.log",
    }),
  ],

  rejectionHandlers: [
    new winston.transports.File({
      filename: "logs/rejections.log",
    }),
  ],

  exitOnError: false,
});
