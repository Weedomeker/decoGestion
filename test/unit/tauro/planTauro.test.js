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
});
