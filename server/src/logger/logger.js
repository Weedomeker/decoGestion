const path = require("path");
const winston = require("winston");
require("winston-daily-rotate-file");
const MongoTransport = require("./mongoTransport");

const SPLAT = Symbol.for("splat");

// Usage :
//   logger.info("PDF OK")                              → message simple
//   logger.error("Échec génération", err)              → message + err.message, stack conservée
//   logger.child({ cmd: job.cmd, client: job.client }) → contexte ajouté à chaque ligne
//   logger.warn("Prix absent", { ref })                → contexte ponctuel
//
// Les arguments texte en trop (logger.error("Échec :", "détail")) étaient ignorés par winston :
// on les recolle au message.
const appendExtraArgs = winston.format((info) => {
  const extras = (info[SPLAT] || []).filter((arg) => typeof arg === "string" || typeof arg === "number");
  if (extras.length) info.message = [String(info.message).trimEnd(), ...extras].join(" ");
  return info;
});

// Clés affichées autrement (ou pas du tout) dans le texte : cmd en préfixe, client seulement en base.
const HIDDEN_KEYS = new Set(["level", "message", "timestamp", "stack", "cmd", "client"]);

function formatContext(info) {
  const pairs = Object.entries(info)
    .filter(([key, value]) => !HIDDEN_KEYS.has(key) && value !== undefined && typeof value !== "object")
    .map(([key, value]) => `${key}=${value}`);
  return pairs.length ? `  ${pairs.join(" ")}` : "";
}

// "[164886] message  ref=123" + stack (erreurs uniquement) sur les lignes suivantes.
function formatBody(info) {
  const cmd = info.cmd ? `[${info.cmd}] ` : "";
  const stack = info.level === "error" && info.stack ? `\n${info.stack}` : "";
  return `${cmd}${info.message}${formatContext(info)}${stack}`;
}

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf((info) => `${info.timestamp}  ${info.level.toUpperCase().padEnd(5)}  ${formatBody(info)}`),
);

const rotateOptions = { datePattern: "YYYY-MM-DD", zippedArchive: false, maxSize: "20m", maxFiles: "14d" };

// Transport NAS, en production seulement. En dev, l'ancien chemin relatif
// (../decoGestion/logs) désignait le même dossier que le fallback local : chaque ligne était
// écrite deux fois dans le même fichier.
const fileRotateTransport =
  process.env.NODE_ENV === "production"
    ? new winston.transports.DailyRotateFile({
        filename: "\\\\NASSYNORS1221\\production\\decoGestion\\logs\\decoGestion-%DATE%.log",
        format: fileFormat,
        ...rotateOptions,
      })
    : null;

// Fallback local toujours actif — utilisé si le NAS est inaccessible
const localFallbackTransport = new winston.transports.DailyRotateFile({
  filename: path.join(__dirname, "../../../logs/decoGestion-%DATE%.log"),
  format: fileFormat,
  ...rotateOptions,
});

fileRotateTransport?.on("error", (err) => {
  console.error("[Logger] Transport NAS inaccessible:", err.message);
});

// Console : "HH:mm:ss  INFO   [cmd] message", niveau coloré et aligné (le fichier garde le format
// horodaté complet, sans codes couleur).
const LEVEL_COLORS = { error: "\x1b[31m", warn: "\x1b[33m", info: "\x1b[36m", debug: "\x1b[90m" };
const DIM = "\x1b[90m";
const RESET = "\x1b[0m";

const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.timestamp({ format: "HH:mm:ss" }),
    winston.format.printf((info) => {
      const color = LEVEL_COLORS[info.level] || "";
      const level = info.level.toUpperCase().padEnd(5);
      return `${DIM}${info.timestamp}${RESET}  ${color}${level}${RESET}  ${formatBody(info)}`;
    }),
  ),
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(winston.format.errors({ stack: true }), appendExtraArgs()),
  transports: [fileRotateTransport, localFallbackTransport, consoleTransport].filter(Boolean),
});

// Copie des logs dans MongoDB (collection "logs"). Activée explicitement par server.js : les tests
// et les scripts de maintenance n'écrivent pas en base.
let mongoTransport = null;

logger.enableMongo = () => {
  if (!mongoTransport) {
    mongoTransport = new MongoTransport();
    logger.add(mongoTransport);
  }
};

// Vide le tampon MongoDB (avant un process.exit), sans attendre plus de timeoutMs.
logger.flushMongo = (timeoutMs = 3000) =>
  mongoTransport
    ? Promise.race([mongoTransport.flush(), new Promise((resolve) => setTimeout(resolve, timeoutMs).unref())])
    : Promise.resolve();

module.exports = logger;
