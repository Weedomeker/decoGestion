const winston = require("winston");
require("winston-daily-rotate-file");

// Format des logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf((info) => `${info.timestamp} - [${info.level.toUpperCase()}] - ${info.message}`),
);

// Transport fichier rotation quotidienne
const fileRotateTransport = new winston.transports.DailyRotateFile({
  filename:
    process.env.NODE_ENV === "production" ? "var/log/decoGestion/app-%DATE%.log" : "../decoGestion/logs/app-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  zippedArchive: false,
  maxSize: "20m",
  maxFiles: "14d",
});

// Transport console (dev)
const consoleTransport =
  process.env.NODE_ENV !== "production"
    ? new winston.transports.Console({
        format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
      })
    : null;

const logger = winston.createLogger({
  level: "info",
  format: logFormat,
  transports: [fileRotateTransport, ...(consoleTransport ? [consoleTransport] : [])],
});

module.exports = logger;
