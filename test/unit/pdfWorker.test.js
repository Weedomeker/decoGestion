const assert = require('assert');

describe('usePdfWorker', () => {
  before(() => {
    // Initialiser appState minimal pour que state.paths.serverRoot soit défini
    const { state } = require('../../server/src/services/appState');
    if (!state.paths.serverRoot) {
      const path = require('path');
      state.paths.serverRoot = path.join(__dirname, '../../server');
    }
  });

  it('exports a function', () => {
    const usePdfWorker = require('../../server/src/utils/pdfWorker');
    assert.strictEqual(typeof usePdfWorker, 'function');
  });

  it('returns a Promise when called', () => {
    const usePdfWorker = require('../../server/src/utils/pdfWorker');
    const result = usePdfWorker({ pdf: '/nonexistent.pdf', jpg: '/tmp/out.jpg' });
    assert.ok(result instanceof Promise, 'should return a Promise');
    return result.catch(() => {}); // le PDF n'existe pas — on ignore l'erreur
  });
});
