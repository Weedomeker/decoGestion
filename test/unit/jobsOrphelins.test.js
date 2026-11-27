"use strict";
const assert = require("node:assert/strict");
const sinon = require("sinon");
const { retirerJobsOrphelins } = require("../../server/src/services/jobsOrphelins");

function fauxJob(id, job, { echec = false } = {}) {
  return { id, data: { job }, remove: echec ? sinon.stub().rejects(new Error("Job is locked")) : sinon.stub().resolves() };
}

function fausseFile({ actifs = [], attente = [], erreur = null } = {}) {
  const client = { del: sinon.stub().resolves(1) };
  return {
    client: Promise.resolve(client),
    redis: client,
    toKey: (type) => `bull:deco-jobs:${type}`,
    getJobs: sinon.stub().callsFake(async (etats) => {
      if (erreur) throw erreur;
      return etats.includes("active") ? actifs : attente;
    }),
  };
}

const fauxLogger = () => ({ warn: sinon.stub(), error: sinon.stub(), info: sinon.stub() });

describe("retirerJobsOrphelins (jobs restés dans Redis au démarrage)", () => {
  it("file vide : rien à retirer, aucun avertissement", async () => {
    const logger = fauxLogger();
    const bilan = await retirerJobsOrphelins(fausseFile(), logger);
    assert.deepEqual(bilan, { attente: [], enCours: [], fichiersAttente: [] });
    assert.equal(logger.warn.called, false);
  });

  it("job en cours : verrou supprimé puis job retiré, signalé avec son nom Tauro", async () => {
    const actif = fauxJob("a-1", { nomTauro: "011_S1711A_151x260_MAT_169034_X_4", cmd: 169034 });
    const file = fausseFile({ actifs: [actif] });
    const logger = fauxLogger();
    const bilan = await retirerJobsOrphelins(file, logger);
    assert.ok(file.redis.del.calledOnceWith("bull:deco-jobs:a-1:lock"));
    assert.ok(file.redis.del.calledBefore(actif.remove));
    assert.deepEqual(bilan.enCours, ["011_S1711A_151x260_MAT_169034_X_4.pdf"]);
    assert.match(logger.warn.firstCall.args[0], /Vérifier dans Asanti.*011_S1711A/);
  });

  it("jobs en attente : retirés et listés (crédence, hors session)", async () => {
    const a = fauxJob("w-1", { cmd: 169034, cmd2: 169380 });
    const b = fauxJob("w-2", { cmd: 170000, horsSession: true });
    const file = fausseFile({ attente: [a, b] });
    const logger = fauxLogger();
    const bilan = await retirerJobsOrphelins(file, logger);
    assert.ok(a.remove.calledOnce && b.remove.calledOnce);
    assert.deepEqual(bilan.attente, ["commande 169034+169380", "commande 170000 (hors session)"]);
    assert.equal(file.redis.del.called, false);
    assert.match(logger.warn.firstCall.args[0], /à rajouter dans la file/);
  });

  it("un retrait en échec est logué, les autres jobs sont quand même retirés", async () => {
    const ko = fauxJob("w-1", { cmd: 1 }, { echec: true });
    const ok = fauxJob("w-2", { cmd: 2 });
    const logger = fauxLogger();
    const bilan = await retirerJobsOrphelins(fausseFile({ attente: [ko, ok] }), logger);
    assert.deepEqual(bilan.attente, ["commande 2"]);
    assert.equal(logger.error.callCount, 1);
  });

  it("Redis en erreur : ne lève pas, bilan vide", async () => {
    const logger = fauxLogger();
    const bilan = await retirerJobsOrphelins(fausseFile({ erreur: new Error("ECONNREFUSED") }), logger);
    assert.deepEqual(bilan, { attente: [], enCours: [], fichiersAttente: [] });
    assert.equal(logger.error.callCount, 1);
  });

  it("job de session passé par le dossier d'attente : son PDF d'attente est rendu pour suppression", async () => {
    const path = require("path");
    const actif = fauxJob("a-2", { nomTauro: "011_S2711A_X", dossierAttente: "\\NAS\temp\PRINTSA#27 NOV 2026" });
    const enAttente = fauxJob("w-3", { nomTauro: "012_S2711A_X", dossierAttente: "\\NAS\temp\PRINTSA#27 NOV 2026" });
    const classique = fauxJob("w-4", { cmd: 170001 });
    const bilan = await retirerJobsOrphelins(fausseFile({ actifs: [actif], attente: [enAttente, classique] }), fauxLogger());
    assert.deepEqual(bilan.fichiersAttente, [
      path.join("\\NAS\temp\PRINTSA#27 NOV 2026", "011_S2711A_X.pdf"),
      path.join("\\NAS\temp\PRINTSA#27 NOV 2026", "012_S2711A_X.pdf"),
    ]);
  });
});
