"use strict";
const assert = require("node:assert/strict");
const { construirePlan, serialiser } = require("../../../server/src/tauro/planTauro");
const { nomsJob } = require("../../../server/src/utils/nomsJob");

describe("tauro/planTauro", () => {
  let n = 0;
  const dg = (o = {}) => ({
    _id: `id${++n}`,
    client: "LM",
    ville: "Paris",
    cmd: 170000 + n,
    sousDossier: "00",
    visuel: "ONYX 150x210 DROIT 94963991 MAT.pdf",
    visuPath: "C:/v/x.pdf",
    format_visu: "150x210",
    format_Plaque: "Deco_Std_151x260",
    ex: 1,
    ...o,
  });
  const DATE = "2026-11-17";
  const cinquante = () => [...Array.from({ length: 50 }, () => dg()), dg({ ex: 3 })];

  it("53 ex. de Mat : une session de 50 ex., 3 ex. restants", () => {
    const plan = construirePlan(cinquante(), [], { date: DATE });
    assert.equal(plan.mode, "session");
    assert.equal(plan.finition, "MAT");
    assert.equal(plan.sessions.length, 1);
    assert.equal(plan.sessions[0].code, "S1711A");
    assert.equal(plan.sessions[0].ex, 50);
    assert.equal(plan.restants.length, 1);
    assert.equal(plan.restants[0].ex, 3);
    assert.equal(plan.aLancer.length, 50);
    assert.ok(
      plan.aLancer.every(
        (j) => j.nomTauro && j.sessionTauro === "S1711A" && j.hfTauro && j.signatureTauro && j.clesTauro.length,
      ),
    );
  });

  it("taille réglable : Mat exactement N ex. par session ; défaut 50 renvoyé dans le plan", () => {
    const jobs = cinquante();
    const defaut = construirePlan(jobs, [], { date: DATE });
    assert.deepEqual(defaut.taille, { exMat: 50, minBrillant: 20, maxBrillant: 60 });
    const plan = construirePlan(jobs, [], { date: DATE, taille: { exMat: 40 } });
    assert.deepEqual(
      plan.sessions.map((s) => s.ex),
      [40],
    );
    assert.equal(plan.taille.exMat, 40);
    assert.notEqual(plan.empreinte, defaut.empreinte);
  });

  it("taille réglable : Brillant entre min et max (cible 50 ramenée dans l'intervalle)", () => {
    const bri = (ex) => dg({ visuel: "ONYX 150x210 DROIT 94963991 BRILLANT.pdf", ex });
    const quatorze = [bri(4), bri(5), bri(5)];
    assert.equal(construirePlan(quatorze, [], { date: DATE, finition: "BRI" }).sessions.length, 0);
    const permis = construirePlan(quatorze, [], { date: DATE, finition: "BRI", taille: { minBrillant: 10 } });
    assert.deepEqual(
      permis.sessions.map((s) => s.ex),
      [14],
    );
    const petitRack = construirePlan(
      Array.from({ length: 50 }, () => bri(1)),
      [],
      { date: DATE, finition: "BRI", taille: { minBrillant: 10, maxBrillant: 30 } },
    );
    assert.deepEqual(
      petitRack.sessions.map((s) => s.ex),
      [30, 20],
    );
  });

  it("teinte masse et stock : sansPdf, aLancer sans nomTauro, hors total", () => {
    const jobs = [
      ...cinquante(),
      dg({ teinteMasse: true, format_visu: "BLANC_150x255", ex: 4 }),
      dg({ useStock: true, ex: 2 }),
    ];
    const plan = construirePlan(jobs, [], { date: DATE });
    assert.equal(plan.sansPdf.length, 2);
    assert.equal(plan.sessions[0].ex, 50);
    const fin = plan.aLancer.slice(-2);
    assert.ok(fin.every((j) => j.nomTauro === undefined && j.sessionTauro === undefined));
    assert.deepEqual(
      fin.map((j) => j._id),
      [jobs[51]._id, jobs[52]._id],
    );
    assert.equal(plan.aLancer.length, 52);
  });

  it("aLancer trié par ordreTauro puis sansPdf", () => {
    const jobs = [dg({ useStock: true }), ...cinquante()];
    const plan = construirePlan(jobs, [], { date: DATE });
    const ordres = plan.aLancer.filter((j) => j.ordreTauro !== undefined).map((j) => j.ordreTauro);
    assert.deepEqual(
      ordres,
      [...ordres].sort((a, b) => a - b),
    );
    assert.equal(plan.aLancer[plan.aLancer.length - 1]._id, jobs[0]._id);
  });

  it("ne modifie pas les jobs d'origine", () => {
    const jobs = cinquante();
    construirePlan(jobs, [], { date: DATE });
    assert.equal(jobs[0].nomTauro, undefined);
    assert.equal(jobs[0].clesTauro, undefined);
  });

  it("empreinte stable, change avec ex", () => {
    const a = construirePlan(
      cinquante().map((j, i) => ({ ...j, _id: `z${i}`, cmd: 1000 + i })),
      [],
      { date: DATE },
    );
    const b = construirePlan(
      cinquante().map((j, i) => ({ ...j, _id: `z${i}`, cmd: 1000 + i })),
      [],
      { date: DATE },
    );
    assert.equal(a.empreinte, b.empreinte);
    assert.match(a.empreinte, /^[0-9a-f]{40}$/);
    const jobs = cinquante().map((j, i) => ({ ...j, _id: `z${i}`, cmd: 1000 + i }));
    jobs[0].ex = 2;
    jobs[1].ex = 1;
    const c = construirePlan(jobs, [], { date: DATE });
    assert.notEqual(a.empreinte, c.empreinte);
  });

  it("hors session : nom d'origine, sans nomTauro", () => {
    const jobs = [dg({ ex: 2 })];
    const plan = construirePlan(jobs, [], { date: DATE, mode: "hors-session" });
    assert.equal(plan.sessions.length, 0);
    assert.equal(plan.horsSession.length, 1);
    assert.equal(plan.horsSession[0].nom, nomsJob(jobs[0]).pdfBaseName.replace(/\.pdf$/, ""));
    assert.equal(plan.horsSession[0].id, jobs[0]._id);
    const j = plan.aLancer[0];
    assert.equal(j.horsSession, true);
    assert.equal(j.nomTauro, undefined);
    assert.equal(j.nomOrigine, plan.horsSession[0].nom);
    assert.ok(j.clesTauro.length && j.hfTauro && j.signatureTauro);
  });

  it("hors session sans nom d'origine : bloqué", () => {
    const plan = construirePlan([dg({ ville: undefined })], [], { date: DATE, mode: "hors-session" });
    assert.equal(plan.aLancer.length, 0);
    assert.equal(plan.bloques.length, 1);
    assert.equal(plan.bloques[0].raison, "nom d'origine introuvable");
  });

  it("mode invalide : erreur", () => {
    assert.throws(() => construirePlan([dg()], [], { date: DATE, mode: "x" }), /Mode de lancement invalide/);
  });

  it("alerte de finition", () => {
    const plan = construirePlan([dg({ refDbData: { finition: "Brillant" } })], [], {
      date: DATE,
      mode: "hors-session",
    });
    assert.ok(
      plan.alertes.some((a) => /finition du nom \(MAT\) ≠ référence \(BRI\)/.test(a)),
      plan.alertes.join("|"),
    );
  });

  it("serialiser retire aLancer", () => {
    const s = serialiser(construirePlan(cinquante(), [], { date: DATE }));
    assert.equal(s.aLancer, undefined);
    assert.ok(s.empreinte);
  });

  it("empreinte hors session : change avec le nom du PDF", () => {
    const a = construirePlan([dg({ _id: "h1", cmd: 1, ville: "Paris" })], [], { date: DATE, mode: "hors-session" });
    const b = construirePlan([dg({ _id: "h1", cmd: 1, ville: "Lyon" })], [], { date: DATE, mode: "hors-session" });
    assert.notEqual(a.empreinte, b.empreinte);
  });

  it("alerte de finition : sur-mesure compare la finition du smBase", () => {
    const sm = dg({
      visuel: "x.pdf",
      smBase: "169034 - LM AMIENS - 80x210 - JARDIN SECRET GAUCHE BRILLANT",
      smFormat: "80x210",
      smPage: 1,
      refDbData: { finition: "Mat" },
    });
    const plan = construirePlan([sm], [], { date: DATE, mode: "hors-session" });
    assert.ok(
      plan.alertes.some((a) => /finition du nom \(BRI\) ≠ référence \(MAT\)/.test(a)),
      plan.alertes.join("|"),
    );
  });
});

describe("tauro/planTauro — calculerPlan (journal du jour)", () => {
  const Module = require("module");
  const faux = { find: null };
  let requetes;

  function charger() {
    const original = Module._load;
    Module._load = function (request, ...args) {
      if (request === "../models/LancementTauro") return faux;
      return original.call(this, request, ...args);
    };
    const cheminJournal = require.resolve("../../../server/src/tauro/journalTauro");
    const cheminPlan = require.resolve("../../../server/src/tauro/planTauro");
    delete require.cache[cheminJournal];
    delete require.cache[cheminPlan];
    try {
      return require(cheminPlan);
    } finally {
      delete require.cache[cheminJournal];
      delete require.cache[cheminPlan];
      Module._load = original;
    }
  }

  // Journal : une entrée du jour, d'une commande sans rapport, renvoyée seulement si la requête vise ce jour.
  const entreeDuJour = {
    date: new Date("2026-11-17T09:00:00"),
    jour: "2026-11-17",
    job: "003_S1711A_151x260_MAT_999999_AUTRE-150x210_1",
    hf: "Deco_Std_151x260",
    cle: "999999/00",
    cmd: "999999",
    ex: 1,
  };

  beforeEach(() => {
    requetes = [];
    faux.find = (q) => {
      requetes.push(q);
      const duJour = q.$or.some((c) => c.jour === "2026-11-17");
      return { lean: async () => (duJour ? [entreeDuJour] : []) };
    };
  });

  let n = 0;
  const dg = (o = {}) => ({
    _id: `cp${++n}`,
    client: "LM",
    ville: "Paris",
    cmd: 180000 + n,
    sousDossier: "00",
    visuel: "ONYX 150x210 DROIT 94963991 MAT.pdf",
    visuPath: "C:/v/x.pdf",
    format_visu: "150x210",
    format_Plaque: "Deco_Std_151x260",
    ex: 1,
    ...o,
  });

  it("interroge le journal sur le jour AAAA-MM-JJ et poursuit la lettre et la numérotation du jour", async () => {
    const { calculerPlan } = charger();
    const jobs = Array.from({ length: 50 }, () => dg());
    const plan = await calculerPlan(jobs, { date: "2026-11-17" });
    assert.ok(
      requetes[0].$or.some((c) => c.jour === "2026-11-17"),
      JSON.stringify(requetes[0]),
    );
    assert.equal(plan.sessions.length, 1);
    assert.equal(plan.sessions[0].code, "S1711B");
    assert.equal(plan.sessions[0].depart, 4);
  });
});
