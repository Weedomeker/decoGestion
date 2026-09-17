const assert = require('assert');

describe('pdfToimg worker', () => {
  it('exports a function (Piscina-compatible)', () => {
    const workerFn = require('../../server/src/pdfToimg');
    assert.strictEqual(typeof workerFn, 'function');
  });

  it('rejects with an error when the PDF does not exist', async () => {
    const workerFn = require('../../server/src/pdfToimg');
    await assert.rejects(
      () => workerFn({ pdf: '/nonexistent.pdf', jpg: '/tmp/out.jpg' }),
      /introuvable/i,
    );
  });
});
