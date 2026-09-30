const { expect } = require("chai");
const Module = require("module");

// Stub bullmq + ioredis : pas de Redis requis (contrairement à queueService.test.js).
function loadQueueService() {
  class FakeRedis {
    on() {
      return this;
    }
  }
  class FakeWorker {
    constructor(name, processor, opts) {
      this.concurrency = opts.concurrency;
    }
    on() {
      return this;
    }
  }
  class FakeQueue {}
  class FakeQueueEvents {}

  const modulePath = require.resolve("../../server/src/services/queueService");
  delete require.cache[modulePath];

  const originalLoad = Module._load;
  Module._load = function (request, ...args) {
    if (request === "ioredis") return FakeRedis;
    if (request === "bullmq") return { Queue: FakeQueue, Worker: FakeWorker, QueueEvents: FakeQueueEvents };
    return originalLoad.call(this, request, ...args);
  };
  try {
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
  }
}

describe("queueService — concurrence", () => {
  it("utilise la concurrence passée à initWorker si elle est valide", () => {
    const qs = loadQueueService();
    const worker = qs.initWorker(async () => {}, { concurrency: 5 });
    expect(worker.concurrency).to.equal(5);
    expect(qs.getConcurrency()).to.equal(5);
  });

  it("ignore une concurrence initiale invalide (garde la valeur par défaut)", () => {
    const qs = loadQueueService();
    const worker = qs.initWorker(async () => {}, { concurrency: 99 });
    expect(worker.concurrency).to.be.within(qs.MIN_CONCURRENCY, qs.MAX_CONCURRENCY);
  });

  it("setConcurrency modifie le worker à chaud", () => {
    const qs = loadQueueService();
    const worker = qs.initWorker(async () => {}, { concurrency: 2 });
    expect(qs.setConcurrency("4")).to.equal(4);
    expect(worker.concurrency).to.equal(4);
  });

  it("setConcurrency rejette les valeurs hors bornes avec une RangeError", () => {
    const qs = loadQueueService();
    qs.initWorker(async () => {}, { concurrency: 2 });
    expect(() => qs.setConcurrency(0)).to.throw(RangeError);
    expect(() => qs.setConcurrency(9)).to.throw(RangeError);
    expect(() => qs.setConcurrency("abc")).to.throw(RangeError);
    expect(qs.getConcurrency()).to.equal(2);
  });
});
