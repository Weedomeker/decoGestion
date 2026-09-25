const assert = require('assert');

describe('queueService', () => {
  let queueService;

  before(() => {
    // Stub ioredis pour éviter une vraie connexion Redis en test unitaire
    const Module = require('module');
    const originalLoad = Module._load;
    Module._load = function (request, ...args) {
      if (request === 'ioredis') {
        return class FakeRedis {
          constructor() {}
          on() { return this; }
          disconnect() {}
          duplicate() { return new FakeRedis(); }
        };
      }
      return originalLoad.call(this, request, ...args);
    };

    queueService = require('../../server/src/services/queueService');

    Module._load = originalLoad;
  });

  it('exporte decoQueue', () => {
    assert.ok(queueService.decoQueue, 'decoQueue doit être défini');
  });

  it('exporte queueEvents', () => {
    assert.ok(queueService.queueEvents, 'queueEvents doit être défini');
  });

  it('exporte initWorker en tant que fonction', () => {
    assert.strictEqual(typeof queueService.initWorker, 'function');
  });
});
