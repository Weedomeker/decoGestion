const path = require("path");
const winston = require("winston");
require("winston-daily-rotate-file");

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf((info) => `${info.timestamp} - [${info.level.toUpperCase()}] - ${info.message}`),
);

// Transport NAS (production) ou relatif (dev)
const fileRotateTransport = new winston.transports.DailyRotateFile({
  filename:
    process.env.NODE_ENV === "production"
      ? "\\\\NASSYNORS1221\\production\\decoGestion\\logs\\decoGestion-%DATE%.log"
      : "../decoGestion/logs/decoGestion-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  zippedArchive: false,
  maxSize: "20m",
  maxFiles: "14d",
});

// Fallback local toujours actif — utilisé si le NAS est inaccessible
const localFallbackTransport = new winston.transports.DailyRotateFile({
  filename: path.join(__dirname, "../../../logs/decoGestion-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  zippedArchive: false,
  maxSize: "20m",
  maxFiles: "14d",
});

fileRotateTransport.on("error", (err) => {
  console.error("[Logger] Transport NAS inaccessible:", err.message);
});

// Console : "HH:mm:ss  INFO   message", niveau coloré et aligné (le fichier garde le format
// horodaté complet ci-dessus, sans codes couleur).
const LEVEL_COLORS = { error: "\x1b[31m", warn: "\x1b[33m", info: "\x1b[36m", debug: "\x1b[90m" };
const DIM = "\x1b[90m";
const RESET = "\x1b[0m";

const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.timestamp({ format: "HH:mm:ss" }),
    winston.format.printf((info) => {
      const color = LEVEL_COLORS[info.level] || "";
      const level = info.level.toUpperCase().padEnd(5);
      return `${DIM}${info.timestamp}${RESET}  ${color}${level}${RESET}  ${info.message}`;
    }),
  ),
});

const logger = winston.createLogger({
  level: "info",
  format: logFormat,
  transports: [fileRotateTransport, localFallbackTransport, consoleTransport],
});

module.exports = logger;
