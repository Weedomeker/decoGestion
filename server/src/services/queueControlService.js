const logger = require("../logger/logger");
const { decoQueue, queueEvents, getConcurrency } = require("./queueService");
const { broadcastWS } = require("./websocketService");

const WAIT_TIMEOUT_MS = 7200000;
// États BullMQ d'un job pas encore démarré : annulable. `delayed` couvre le backoff entre deux tentatives.
const PENDING_STATES = ["waiting", "prioritized", "delayed"];
const REPRIORITIZABLE_STATES = ["waiting", "prioritized"];

// État du traitement en cours (un seul run à la fois).
// bullJobIds : _id du job de la liste → jobId BullMQ ; cancelWaiters : jobId BullMQ → résolution forcée de son attente.
const run = {
  running: false,
  paused: false,
  bullJobIds: new Map(),
  cancelWaiters: new Map(),
};

// Renvoie les jobs dans l'ordre de `ids` ; les ids inconnus sont ignorés et les jobs absents de `ids`
// sont conservés à la fin, dans leur ordre d'origine (un job ajouté pendant le drag n'est jamais perdu).
function reorderByIds(jobs, ids) {
  const byId = new Map(jobs.map((job) => [String(job._id), job]));
  const ordered = [];
  const seen = new Set();

  for (const id of Array.isArray(ids) ? ids : []) {
    const key = String(id);
    if (byId.has(key) && !seen.has(key)) {
      ordered.push(byId.get(key));
      seen.add(key);
    }
  }
  for (const job of jobs) {
    if (!seen.has(String(job._id))) ordered.push(job);
  }
  return ordered;
}

// Sans `ids`, tous les jobs ; sinon ceux sélectionnés, dans l'ordre de la liste.
function selectJobs(jobs, ids) {
  if (!Array.isArray(ids)) return [...jobs];
  const selected = new Set(ids.map(String));
  return jobs.filter((job) => selected.has(String(job._id)));
}

function isRunning() {
  return run.running;
}

async function getStatus() {
  let counts = {};
  try {
    counts = await decoQueue.getJobCounts("active", "waiting", "prioritized", "delayed");
  } catch (error) {
    logger.warn(`Lecture des compteurs BullMQ impossible : ${error.message}`);
  }
  return { running: run.running, paused: run.paused, concurrency: getConcurrency(), counts };
}

function broadcastQueueStatus() {
  return getStatus()
    .then((status) => broadcastWS({ type: "queue", ...status }))
    .catch(() => {});
}

// Enfile les jobs avec une priorité égale à leur position (1 = premier) et attend qu'ils soient tous
// terminés, en échec définitif ou annulés. Ne rejette jamais à cause d'un job : renvoie un bilan.
async function enqueueRun(jobsToRun, extraData = {}) {
  if (run.running) throw new Error("Un traitement est déjà en cours");

  run.running = true;
  run.bullJobIds = new Map();
  run.cancelWaiters = new Map();
  // Un jobId unique par run : BullMQ ignore silencieusement un jobId déjà connu (job échoué relancé).
  const runId = Date.now();

  try {
    const bullJobs = await decoQueue.addBulk(
      jobsToRun.map((job, index) => {
        const jobId = `${job._id}-${runId}`;
        run.bullJobIds.set(String(job._id), jobId);
        return {
          name: "process-job",
          data: { job, ...extraData },
          opts: {
            jobId,
            priority: index + 1,
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
          },
        };
      }),
    );

    logger.info(`📥 ${bullJobs.length} job(s) ajoutés à la queue BullMQ.`);
    broadcastQueueStatus();

    const results = await Promise.allSettled(
      bullJobs.map((bullJob) => {
        // waitUntilFinished n'est jamais résolu pour un job retiré de la queue : l'annulation le débloque.
        const cancelled = new Promise((resolve) => run.cancelWaiters.set(bullJob.id, () => resolve("cancelled")));
        return Promise.race([bullJob.waitUntilFinished(queueEvents, WAIT_TIMEOUT_MS), cancelled]);
      }),
    );

    const failed = results.filter((r) => r.status === "rejected");
    failed.forEach((r) => logger.error(`⚠️ Job en échec définitif : ${r.reason?.message ?? r.reason}`));

    return {
      total: bullJobs.length,
      failed: failed.length,
      cancelled: results.filter((r) => r.status === "fulfilled" && r.value === "cancelled").length,
    };
  } finally {
    run.running = false;
    run.bullJobIds = new Map();
    run.cancelWaiters = new Map();
    broadcastQueueStatus();
  }
}

// Répercute l'ordre de la liste sur les priorités des jobs du run pas encore démarrés.
async function applyPriorities(orderedJobs) {
  if (!run.running) return 0;

  let changed = 0;
  await Promise.all(
    orderedJobs.map(async (job, index) => {
      const bullJobId = run.bullJobIds.get(String(job._id));
      if (!bullJobId) return;
      try {
        const bullJob = await decoQueue.getJob(bullJobId);
        if (!bullJob) return;
        const jobState = await bullJob.getState();
        if (!REPRIORITIZABLE_STATES.includes(jobState)) return;
        await bullJob.changePriority({ priority: index + 1 });
        changed++;
      } catch (error) {
        // Le job a pu démarrer entre getState et changePriority : sans conséquence.
        logger.warn(`Priorité non modifiée pour ${bullJobId} : ${error.message}`);
      }
    }),
  );
  return changed;
}

// Retire de BullMQ les jobs du run pas encore démarrés ; les jobs actifs se terminent normalement.
// Les jobs retirés ne passent pas dans `completed` et restent donc dans la file d'attente de l'appli.
async function cancelPending() {
  if (!run.running) return 0;

  let removed = 0;
  for (const bullJobId of run.bullJobIds.values()) {
    try {
      const bullJob = await decoQueue.getJob(bullJobId);
      if (!bullJob) continue;
      const jobState = await bullJob.getState();
      if (!PENDING_STATES.includes(jobState)) continue;
      await bullJob.remove();
      removed++;
      run.cancelWaiters.get(bullJobId)?.();
    } catch (error) {
      // Typiquement : le job vient de passer actif (verrouillé) — il ira à son terme.
      logger.warn(`Job ${bullJobId} non annulé : ${error.message}`);
    }
  }

  logger.info(`🛑 Annulation : ${removed} job(s) non démarré(s) retiré(s) de la queue.`);
  return removed;
}

// La pause BullMQ est globale et persistée dans Redis : les jobs actifs se terminent,
// aucun nouveau job n'est pris tant qu'on ne reprend pas.
async function pause() {
  await decoQueue.pause();
  run.paused = true;
}

async function resume() {
  await decoQueue.resume();
  run.paused = false;
}

// Au démarrage : la queue peut être restée en pause dans Redis depuis une session précédente.
async function syncPausedState() {
  try {
    run.paused = await decoQueue.isPaused();
    if (run.paused) logger.warn("⏸️ La queue BullMQ est en pause (état conservé dans Redis).");
  } catch (error) {
    logger.warn(`État de pause BullMQ illisible : ${error.message}`);
  }
}

module.exports = {
  reorderByIds,
  selectJobs,
  isRunning,
  getStatus,
  broadcastQueueStatus,
  enqueueRun,
  applyPriorities,
  cancelPending,
  pause,
  resume,
  syncPausedState,
};
