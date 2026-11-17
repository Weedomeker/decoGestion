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
    assert.equal(entrees[0].date, date.toISOString());
    assert.equal(entrees[0].cle, "169180/01");
    const plan = L.preparerLancement([ligne], { date: "2026-11-13", journal: entrees });
    assert.equal(plan.bloques.length, 1);
  });

  it("dejaInscrit : exige cle, nom et jobId", async () => {
    faux.exists.resolves({ _id: 1 });
    assert.equal(await journal.dejaInscrit(jobTauro), true);
    assert.deepEqual(faux.exists.firstCall.args[0], { cle: "169034/00", job: jobTauro.nomTauro, jobId: "abc123" });
    faux.exists.resolves(null);
    assert.equal(await journal.dejaInscrit(jobTauro), false);
  });
});
