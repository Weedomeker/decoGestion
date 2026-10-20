const os = require("os");
const mongoose = require("mongoose");
const { Transport } = require("winston");

// Transport winston → collection MongoDB "logs" (lisible par decoGestion-API).
//
// Document : { ts, level, message, cmd?, client?, meta?, stack?, host, env, version }
//   - cmd/client : contexte passé via logger.child({ cmd, client }) ou logger.info(msg, { cmd })
//   - meta       : toute autre clé de contexte
//   - TTL        : purge automatique après LOG_DB_RETENTION_DAYS jours (90 par défaut)
//
// Écriture par lots (toutes les 2 s ou 100 entrées) via le driver natif : jamais de mise en attente
// mongoose ni de log récursif. Tant que MongoDB est indisponible, les entrées restent en mémoire
// (MAX_BUFFER au plus, les plus anciennes sont abandonnées).
const COLLECTION = "logs";
const BATCH_SIZE = 100;
const FLUSH_MS = 2000;
const MAX_BUFFER = 2000;
const RETENTION_DAYS = Number(process.env.LOG_DB_RETENTION_DAYS) || 90;
const RESERVED = new Set(["level", "message", "timestamp", "stack", "cmd", "client"]);

function appVersion() {
  try {
    // Require différé : appState importe lui-même le logger.
    const { state } = require("../services/appState");
    return state.app?.version || state.appVersion || undefined;
  } catch {
    return undefined;
  }
}

function toDocument(info) {
  const meta = {};
  for (const [key, value] of Object.entries(info)) {
    if (!RESERVED.has(key) && value !== undefined) meta[key] = value;
  }
  const doc = {
    ts: new Date(),
    level: info.level,
    message: String(info.message ?? ""),
    cmd: info.cmd,
    client: info.client,
    meta: Object.keys(meta).length ? meta : undefined,
    stack: info.stack,
    host: os.hostname(),
    env: process.env.NODE_ENV,
    version: appVersion(),
  };
  // Le driver écrirait null pour undefined : on retire les champs absents.
  for (const key of Object.keys(doc)) if (doc[key] == null) delete doc[key];
  return doc;
}

class MongoTransport extends Transport {
  constructor(opts = {}) {
    super({ level: opts.level || process.env.LOG_DB_LEVEL || "info" });
    this.connection = opts.connection || mongoose.connection;
    this.buffer = [];
    this.flushing = null;
    this.indexesReady = false;
    this.errorReported = false;
    this.timer = setInterval(() => this.flush(), opts.flushMs || FLUSH_MS);
    this.timer.unref();
  }

  log(info, callback) {
    this.buffer.push(toDocument(info));
    if (this.buffer.length > MAX_BUFFER) this.buffer.splice(0, this.buffer.length - MAX_BUFFER);
    if (this.buffer.length >= BATCH_SIZE) this.flush();
    this.emit("logged", info);
    callback();
  }

  async ensureIndexes(collection) {
    if (this.indexesReady) return;
    await collection.createIndexes([
      { key: { ts: 1 }, expireAfterSeconds: RETENTION_DAYS * 24 * 3600 },
      { key: { level: 1, ts: -1 } },
      { key: { cmd: 1, ts: -1 } },
    ]);
    this.indexesReady = true;
  }

  // Écrit tout le tampon ; renvoie une promesse (utilisée avant process.exit).
  flush() {
    if (this.flushing) return this.flushing;
    if (!this.buffer.length || this.connection.readyState !== 1) return Promise.resolve();

    this.flushing = (async () => {
      const collection = this.connection.db.collection(COLLECTION);
      try {
        await this.ensureIndexes(collection);
        while (this.buffer.length) {
          // Retiré du tampon avant l'envoi : un lot rejeté est abandonné (il reste dans les
          // fichiers) plutôt que renvoyé indéfiniment.
          const batch = this.buffer.splice(0, BATCH_SIZE);
          await collection.insertMany(batch, { ordered: false });
        }
        this.errorReported = false;
      } catch (err) {
        // console et non logger : un log ici repasserait par ce transport.
        if (!this.errorReported) console.error(`[Logger] Écriture des logs MongoDB impossible : ${err.message}`);
        this.errorReported = true;
      }
    })().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  close() {
    clearInterval(this.timer);
  }
}

module.exports = MongoTransport;
