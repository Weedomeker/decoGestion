const { Queue, Worker, QueueEvents } = require('bullmq');
const IORedis = require('ioredis');
const logger = require('../logger/logger');

const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 8;
const DEFAULT_CONCURRENCY = parseInt(process.env.JOBS_CONCURRENCY) || 3;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

function makeConnection() {
  const conn = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 500, 10000),
  });
  conn.on('error', (err) => {
    if (err.code !== 'ECONNREFUSED') logger.error(`Redis: ${err.message}`);
  });
  return conn;
}

// BullMQ requiert une connexion IORedis distincte pour Queue, QueueEvents et Worker.
const decoQueue = new Queue('deco-jobs', { connection: makeConnection() });
const queueEvents = new QueueEvents('deco-jobs', { connection: makeConnection() });

let worker = null;
let concurrency = DEFAULT_CONCURRENCY;

function isValidConcurrency(n) {
  return Number.isInteger(n) && n >= MIN_CONCURRENCY && n <= MAX_CONCURRENCY;
}

function initWorker(processor, options = {}) {
  const requested = parseInt(options.concurrency);
  if (isValidConcurrency(requested)) concurrency = requested;

  worker = new Worker('deco-jobs', processor, {
    connection: makeConnection(),
    concurrency,
  });

  worker.on('failed', (job, err) => {
    logger.error(`BullMQ job ${job?.data?.job?.cmd ?? 'unknown'} échoué (tentative ${job?.attemptsMade}) : ${err.message}`);
  });

  worker.on('completed', (job) => {
    logger.info(`BullMQ job ${job?.data?.job?.cmd ?? 'unknown'} terminé`);
  });

  return worker;
}

function getConcurrency() {
  return concurrency;
}

// Modifiable à chaud : le setter BullMQ est pris en compte par la boucle du worker
// dès le prochain job récupéré (les jobs actifs ne sont pas interrompus).
function setConcurrency(n) {
  const value = parseInt(n);
  if (!isValidConcurrency(value)) {
    throw new RangeError(`Concurrence invalide : ${n} (attendu ${MIN_CONCURRENCY}-${MAX_CONCURRENCY})`);
  }
  concurrency = value;
  if (worker) worker.concurrency = value;
  logger.info(`⚙️ Concurrence des jobs réglée à ${value}`);
  return value;
}

module.exports = {
  decoQueue,
  queueEvents,
  initWorker,
  getConcurrency,
  setConcurrency,
  MIN_CONCURRENCY,
  MAX_CONCURRENCY,
};
