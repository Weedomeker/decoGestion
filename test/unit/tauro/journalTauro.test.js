"use strict";
const assert = require("node:assert/strict");
const sinon = require("sinon");
const Module = require("module");

// Faux modèle Mongoose : aucun accès à une vraie base.
const faux = { find: sinon.stub(), insertMany: sinon.stub().resolves(), exists: sinon.stub() };

function charger() {
  const original = Module._load;
  Module._load = function (request, ...args) {
    if (request === "../models/LancementTauro") return faux;
    return original.call(this, request, ...args);
  };
  const chemin = require.resolve("../../../server/src/tauro/journalTauro");
  delete require.cache[chemin];
  try {
    return require(chemin);
  } finally {
    Module._load = original;
  }
}

const journal = charger();
const L = require("../../../server/src/tauro/lancement-tauro");
const { ligneDepuisJob } = require("../../../server/src/tauro/depuisJob");

const jobTauro = {
  _id: "abc123",
  nomTauro: "001_S1311A_151x260_MAT_169034_ONYX-150x210_1",
  nomOrigine: "orig",
  hfTauro: "Deco_Std_151x260",
  clesTauro: ["169034/00", "169380/01"],
  ex: 2,
  signatureTauro: "151x260|N|MAT|ONYX 150x210",
};

describe("tauro/journalTauro", () => {
  beforeEach(() => {
    faux.find.reset();
    faux.insertMany.resetHistory();
    faux.exists.reset();
  });

  it("inscrire : un document par clé, même job, cmd par clé, jour local", async () => {
    await journal.inscrire(jobTauro, { source: "src", octets: 10 });
    const docs = faux.insertMany.firstCall.args[0];
    assert.equal(docs.length, 2);
    assert.deepEqual(docs.map((d) => d.cmd), ["169034", "169380"]);
    assert.ok(docs.every((d) => d.job === jobTauro.nomTauro && d.jobId === "abc123" && d.ex === 2));
    assert.ok(docs.every((d) => d.mode === "session" && d.signature === jobTauro.signatureTauro));
    assert.equal(docs[0].jour, docs[0].date.toLocaleDateString("sv-SE"));
  });

  it("inscrire : mode hors-session et cmd vide pour une clé id:", async () => {
    await journal.inscrire({ ...jobTauro, horsSession: true, clesTauro: ["id:77"] }, {});
    const [d] = faux.insertMany.firstCall.args[0];
    assert.equal(d.mode, "hors-session");
    assert.equal(d.cmd, "");
  });

  it("entreesPourLancement : requête $or et format lireJournal ; bloque « déjà lancé »", async () => {
    const date = new Date("2026-11-13T08:00:00Z");
    faux.find.returns({
      lean: async () => [
        { date, job: "001_S1311A_151x260_MAT_169180_JARDIN-SECRET-GAUCHE-150x255_1", hf: "Deco_Std_151x260", source: "", octets: 5, cle: "169180/01", ex: 1, signature: null, cmd: "169180" },
      ],
    });
    const ligne = ligneDepuisJob({
      _id: 1, date: new Date(), client: "LM", ville: "PARIS", cmd: 169180, sousDossier: "01",
      visuel: "JARDIN SECRET 150X255 GAUCHE 94964359 MAT.pdf", visuPath: "", format_visu: "150x255", format_Plaque: "151x260", ex: 1,
    });
    const entrees = await journal.entreesPourLancement([ligne], "2026-11-13");
    assert.deepEqual(faux.find.firstCall.args[0], {
      $or: [{ cle: { $in: ["169180/01"] } }, { cmd: { $in: ["169180"] } }, { jour: "2026-11-13" }],
    });
    assert.equal(entrees[0].date.slice(0, 10), date.toLocaleDateString("sv-SE"));
    assert.equal(entrees[0].cle, "169180/01");
    const plan = L.preparerLancement([ligne], { date: "2026-11-13", journal: entrees });
    assert.equal(plan.bloques.length, 1);
  });

  it("entreesPourLancement : date au jour local (près de minuit UTC), « déjà lancé le » du jour local", async () => {
    // 23:30 UTC le 16 = 00:30 le 17 à Paris : l'opérateur doit lire le 17/11/2026.
    const date = new Date("2026-11-16T23:30:00Z");
    faux.find.returns({
      lean: async () => [
        { date, jour: "2026-11-17", job: "001_S1711A_x", hf: "h", cle: "1/00", cmd: "1" },
        { date, job: "002_S1711A_y", hf: "h", cle: "2/00", cmd: "2" },
      ],
    });
    const [avecJour, sansJour] = await journal.entreesPourLancement([], "2026-11-17");
    assert.match(avecJour.date, /^2026-11-17T\d{2}:\d{2}:\d{2}$/);
    assert.equal(sansJour.date.slice(0, 10), date.toLocaleDateString("sv-SE"));
    assert.match(sansJour.date, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it("dejaInscrit : exige cle, nom et jobId", async () => {
    faux.exists.resolves({ _id: 1 });
    assert.equal(await journal.dejaInscrit(jobTauro), true);
    assert.deepEqual(faux.exists.firstCall.args[0], { cle: "169034/00", job: jobTauro.nomTauro, jobId: "abc123" });
    faux.exists.resolves(null);
    assert.equal(await journal.dejaInscrit(jobTauro), false);
  });

  describe("coupure MongoDB : nouvelles tentatives", () => {
    let horloge;
    const coupure = () => Object.assign(new Error("connect ETIMEDOUT"), { name: "MongoNetworkError" });
    beforeEach(() => {
      horloge = sinon.useFakeTimers();
    });
    afterEach(() => horloge.restore());

    it("dejaInscrit : réessaie après une coupure au lieu de faire échouer le dépôt", async () => {
      faux.exists.onFirstCall().rejects(coupure()).onSecondCall().resolves({ _id: 1 });
      const p = journal.dejaInscrit(jobTauro);
      await horloge.tickAsync(5000);
      assert.equal(await p, true);
      assert.equal(faux.exists.callCount, 2);
    });

    it("inscrire : réessaie après une coupure (PDF déposé, journal finalement écrit)", async () => {
      faux.insertMany.onFirstCall().rejects(coupure());
      const p = journal.inscrire(jobTauro, {});
      await horloge.tickAsync(5000);
      await p;
      assert.equal(faux.insertMany.callCount, 2);
      faux.insertMany.reset();
      faux.insertMany.resolves();
    });

    it("entreesPourLancement : attente courte (aperçu), puis l'erreur remonte", async () => {
      faux.find.returns({ lean: () => Promise.reject(coupure()) });
      const p = journal.entreesPourLancement([], "2026-11-17");
      const verdict = assert.rejects(p, /ETIMEDOUT/);
      await horloge.tickAsync(4000);
      await verdict;
      assert.equal(faux.find.callCount, 3);
    });

    it("erreur non réseau : pas de nouvelle tentative", async () => {
      faux.exists.rejects(new Error("validation"));
      await assert.rejects(journal.dejaInscrit(jobTauro), /validation/);
      assert.equal(faux.exists.callCount, 1);
    });
  });
});
