const { expect } = require("chai");
const sinon = require("sinon");
const Module = require("module");

// queueService ouvre des connexions Redis au require : on le remplace par une fausse queue.
const fakeQueue = {
  addBulk: sinon.stub(),
  getJob: sinon.stub(),
  getJobCounts: sinon.stub().resolves({}),
  pause: sinon.stub().resolves(),
  resume: sinon.stub().resolves(),
  isPaused: sinon.stub().resolves(false),
};

function loadQueueControl() {
  const originalLoad = Module._load;
  Module._load = function (request, ...args) {
    if (request === "./queueService") {
      return { decoQueue: fakeQueue, queueEvents: {}, getConcurrency: () => 3 };
    }
    return originalLoad.call(this, request, ...args);
  };
  const modulePath = require.resolve("../../server/src/services/queueControlService");
  delete require.cache[modulePath];
  try {
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
  }
}

// Faux job BullMQ dont on contrôle l'état et la fin de traitement.
function fakeBullJob(id, jobState = "prioritized") {
  let settle;
  const finished = new Promise((resolve, reject) => (settle = { resolve, reject }));
  return {
    id,
    state: jobState,
    settle,
    getState: sinon.stub().callsFake(async function () {
      return this.state;
    }),
    changePriority: sinon.stub().resolves(),
    remove: sinon.stub().resolves(),
    waitUntilFinished: () => finished,
  };
}

// Enfile les jobs donnés et renvoie les faux jobs BullMQ + la promesse du run.
async function startRun(queueControl, jobs, states = []) {
  const bullJobs = new Map();
  fakeQueue.addBulk.callsFake(async (entries) =>
    entries.map((entry, i) => {
      const bj = fakeBullJob(entry.opts.jobId, states[i]);
      bullJobs.set(entry.opts.jobId, bj);
      return bj;
    }),
  );
  fakeQueue.getJob.callsFake(async (id) => bullJobs.get(id));
  const runPromise = queueControl.enqueueRun(jobs);
  // Laisse addBulk se résoudre et les attentes s'installer.
  await new Promise((resolve) => setImmediate(resolve));
  return { bullJobs: [...bullJobs.values()], runPromise };
}

describe("queueControlService", () => {
  let queueControl;

  before(() => {
    queueControl = loadQueueControl();
  });

  beforeEach(() => {
    fakeQueue.addBulk.reset();
    fakeQueue.getJob.reset();
  });

  describe("reorderByIds()", () => {
    const jobs = [{ _id: 1 }, { _id: 2 }, { _id: 3 }];

    it("réordonne selon les ids (comparaison string/number tolérée)", () => {
      const result = queueControl.reorderByIds(jobs, ["3", 1, 2]);
      expect(result.map((j) => j._id)).to.deep.equal([3, 1, 2]);
    });

    it("ignore les ids inconnus et doublons, conserve les jobs absents à la fin", () => {
      const result = queueControl.reorderByIds(jobs, [2, 99, 2]);
      expect(result.map((j) => j._id)).to.deep.equal([2, 1, 3]);
    });
  });

  describe("selectJobs()", () => {
    const jobs = [{ _id: 1 }, { _id: 2 }, { _id: 3 }];

    it("renvoie toute la file sans ids", () => {
      expect(queueControl.selectJobs(jobs)).to.have.length(3);
    });

    it("garde l'ordre de la liste, pas celui de la sélection", () => {
      const result = queueControl.selectJobs(jobs, [3, "1"]);
      expect(result.map((j) => j._id)).to.deep.equal([1, 3]);
    });
  });

  describe("enqueueRun()", () => {
    it("enfile avec une priorité égale à la position et un jobId unique par run", async () => {
      const { bullJobs, runPromise } = await startRun(queueControl, [{ _id: 10 }, { _id: 20 }]);
      const entries = fakeQueue.addBulk.firstCall.args[0];

      expect(entries.map((e) => e.opts.priority)).to.deep.equal([1, 2]);
      expect(entries[0].opts.jobId).to.match(/^10-\d+$/);

      bullJobs.forEach((bj) => bj.settle.resolve());
      await runPromise;
    });

    it("attend tous les jobs même si l'un échoue, et refuse un second run simultané", async () => {
      const { bullJobs, runPromise } = await startRun(queueControl, [{ _id: 1 }, { _id: 2 }]);

      expect(queueControl.isRunning()).to.equal(true);
      await queueControl.enqueueRun([{ _id: 3 }]).then(
        () => expect.fail("un second run aurait dû être refusé"),
        (err) => expect(err.message).to.match(/déjà en cours/),
      );

      bullJobs[0].settle.reject(new Error("PDF illisible"));
      let done = false;
      runPromise.then(() => (done = true));
      await new Promise((resolve) => setImmediate(resolve));
      expect(done, "le run ne doit pas finir tant qu'un job tourne").to.equal(false);

      bullJobs[1].settle.resolve();
      const summary = await runPromise;
      expect(summary).to.deep.equal({ total: 2, failed: 1, cancelled: 0 });
      expect(queueControl.isRunning()).to.equal(false);
    });
  });

  describe("applyPriorities()", () => {
    it("ne change la priorité que des jobs du run pas encore démarrés", async () => {
      const jobs = [{ _id: 1 }, { _id: 2 }, { _id: 3 }];
      const { bullJobs, runPromise } = await startRun(queueControl, jobs, ["active", "prioritized", "waiting"]);

      const changed = await queueControl.applyPriorities([jobs[2], jobs[1], jobs[0], { _id: 42 }]);

      expect(changed).to.equal(2);
      expect(bullJobs[0].changePriority.called).to.equal(false);
      expect(bullJobs[2].changePriority.firstCall.args[0]).to.deep.equal({ priority: 1 });
      expect(bullJobs[1].changePriority.firstCall.args[0]).to.deep.equal({ priority: 2 });

      bullJobs.forEach((bj) => bj.settle.resolve());
      await runPromise;
    });

    it("ne fait rien hors d'un run", async () => {
      expect(await queueControl.applyPriorities([{ _id: 1 }])).to.equal(0);
    });
  });

  describe("cancelPending()", () => {
    it("retire les jobs non démarrés, laisse finir les actifs et débloque la fin du run", async () => {
      const { bullJobs, runPromise } = await startRun(
        queueControl,
        [{ _id: 1 }, { _id: 2 }, { _id: 3 }],
        ["active", "prioritized", "delayed"],
      );

      const removed = await queueControl.cancelPending();

      expect(removed).to.equal(2);
      expect(bullJobs[0].remove.called).to.equal(false);
      expect(bullJobs[1].remove.calledOnce).to.equal(true);
      expect(bullJobs[2].remove.calledOnce).to.equal(true);

      bullJobs[0].settle.resolve();
      const summary = await runPromise;
      expect(summary).to.deep.equal({ total: 3, failed: 0, cancelled: 2 });
    });

    it("ignore un job devenu actif entre-temps (remove verrouillé)", async () => {
      const { bullJobs, runPromise } = await startRun(queueControl, [{ _id: 1 }], ["waiting"]);
      bullJobs[0].remove.rejects(new Error("Job is locked"));

      expect(await queueControl.cancelPending()).to.equal(0);

      bullJobs[0].settle.resolve();
      expect(await runPromise).to.deep.equal({ total: 1, failed: 0, cancelled: 0 });
    });
  });

  describe("pause() / resume() / getStatus()", () => {
    it("reflète l'état de pause et la concurrence", async () => {
      await queueControl.pause();
      expect(await queueControl.getStatus()).to.include({ paused: true, running: false, concurrency: 3 });

      await queueControl.resume();
      expect((await queueControl.getStatus()).paused).to.equal(false);
    });

    it("synchronise la pause persistée dans Redis", async () => {
      fakeQueue.isPaused.resolves(true);
      await queueControl.syncPausedState();
      expect((await queueControl.getStatus()).paused).to.equal(true);
      fakeQueue.isPaused.resolves(false);
      await queueControl.syncPausedState();
    });
  });
});
