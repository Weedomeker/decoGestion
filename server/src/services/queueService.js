const { Queue, Worker, QueueEvents } = require('bullmq');
const IORedis = require('ioredis');
const logger = require('../logger/logger');

const JOBS_CONCURRENCY = parseInt(process.env.JOBS_CONCURRENCY) || 3;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

function makeConnection() {
  return new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

const decoQueue = new Queue('deco-jobs', { connection: makeConnection() });
const queueEvents = new QueueEvents('deco-jobs', { connection: makeConnection() });

function initWorker(processor) {
  const worker = new Worker('deco-jobs', processor, {
    connection: makeConnection(),
    concurrency: JOBS_CONCURRENCY,
  });

  worker.on('failed', (job, err) => {
    logger.error(`BullMQ job ${job?.data?.job?.cmd} echoue (tentative ${job?.attemptsMade}) : ${err.message}`);
  });

  worker.on('completed', (job) => {
    logger.info(`BullMQ job ${job?.data?.job?.cmd} termine`);
  });

  return worker;
}

module.exports = { decoQueue, queueEvents, initWorker };
