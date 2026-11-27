"use strict";
const assert = require("node:assert/strict");
const sinon = require("sinon");
const {
  lancerTauro,
  trierPourEtiquettes,
  validerOptionsTauro,
  resumeSessions,
} = require("../../../server/src/tauro/lancerTauro");

// Faux `res` Express : garde le statut et le corps envoyés.
function fauxRes() {
  const res = { statut: null, corps: null };
  res.status = (s) => {
    res.statut = s;
    return res;
  };
  res.json = (c) => {
    res.corps = c;
    return res;
  };
  return res;
}

// Verrou réel minimal, même contrat que queueControlService.
function fauxQueueControl() {
  const etat = { running: false, tauro: false };
  return {
    etat,
    reserver: sinon.spy(({ tauro = false } = {}) => {
      if (etat.running) return false;
      etat.running = true;
      etat.tauro = tauro;
      return true;
    }),
    liberer: sinon.spy(() => {
      etat.running = false;
      etat.tauro = false;
    }),
    selectJobs: (jobs, ids) => (Array.isArray(ids) ? jobs.filter((j) => ids.includes(j._id)) : [...jobs]),
    enqueueRun: sinon.stub().resolves({ total: 0, failed: 0, cancelled: 0 }),
  };
}

describe("run_jobs en mode Tauro (lancerTauro)", () => {
  let deps;
  let state;
  let jobs;

  const plan = (aLancer, extra = {}) => ({
    empreinte: "abc",
    sessions: [{ code: "S1711A", depart: 1, dernier: 2 }],
    horsSession: [],
    aLancer,
    ...extra,
  });

  beforeEach(() => {
    jobs = [
      { _id: 1, cmd: 100, ex: 1 },
      { _id: 2, cmd: 200, ex: 1 },
    ];
    state = { jobs: { jobs: [...jobs], completed: [] }, paths: {} };
    const aLancer = jobs.map((j, i) => ({
      ...j,
      nomTauro: `00${i + 1}_S1711A`,
      sessionTauro: "S1711A",
      ordreTauro: i + 1,
    }));
    deps = {
      state,
      queueControl: fauxQueueControl(),
      calculerPlan: sinon.stub().resolves(plan(aLancer)),
      controlerEspaceDisque: sinon.stub().returns(null),
      basculerSortieSecours: sinon.stub(),
      getConcurrency: () => 2,
      generateStickersForJobs: sinon.stub().resolves(),
      broadcastWS: sinon.stub(),
      progression: {
        demarrer: sinon.stub(),
        etiquettes: sinon.stub(),
        avertir: sinon.stub(),
        finir: sinon.stub(),
      },
      logger: { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() },
      tmpdir: () => "/tmp",
    };
  });

  const req = (tauro = {}) => ({
    ip: "::1",
    body: { run: true, tauro: { mode: "session", finition: "MAT", relancer: [], empreinte: "abc", ...tauro } },
  });

  it("empreinte différente : 409 PLAN_CHANGE, rien n'est enfilé et le verrou est libéré", async () => {
    const res = fauxRes();
    await lancerTauro(req({ empreinte: "autre" }), res, deps);
    assert.equal(res.statut, 409);
    assert.equal(res.corps.code, "PLAN_CHANGE");
    assert.equal(res.corps.error, "La file a changé depuis l'aperçu : rafraîchir l'aperçu.");
    assert.equal(deps.queueControl.enqueueRun.called, false);
    assert.equal(deps.queueControl.etat.running, false);
  });

  it("deux appels simultanés : le 2e reçoit 409", async () => {
    let terminer;
    deps.queueControl.enqueueRun = sinon
      .stub()
      .returns(new Promise((resolve) => (terminer = () => resolve({ total: 2, failed: 0, cancelled: 0 }))));
    const res1 = fauxRes();
    const res2 = fauxRes();
    const premier = lancerTauro(req(), res1, deps);
    // La réservation est prise avant tout await : le 2e appel, lancé tout de suite, est refusé.
    await lancerTauro(req(), res2, deps);
    assert.equal(res2.statut, 409);
    assert.equal(deps.calculerPlan.callCount, 1);
    await new Promise((resolve) => setImmediate(resolve));
    terminer();
    await premier;
    assert.equal(res1.statut, 200);
    assert.equal(deps.queueControl.etat.running, false);
  });

  it("réserve en mode Tauro et enfile plan.aLancer avec la réservation existante", async () => {
    const res = fauxRes();
    await lancerTauro(req(), res, deps);
    assert.deepEqual(deps.queueControl.reserver.firstCall.args[0], { tauro: true });
    const [enfiles, , opts] = deps.queueControl.enqueueRun.firstCall.args;
    assert.deepEqual(
      enfiles.map((j) => j.nomTauro),
      ["001_S1711A", "002_S1711A"],
    );
    assert.deepEqual(opts, { dejaReserve: true });
    assert.deepEqual(deps.calculerPlan.firstCall.args[1], {
      mode: "session",
      finition: "MAT",
      relancer: [],
      taille: undefined,
    });
  });

  it("transmet au plan la taille de session choisie dans l'aperçu", async () => {
    const r = req();
    r.body.tauro.taille = { exMat: 40 };
    await lancerTauro(r, fauxRes(), deps);
    assert.deepEqual(deps.calculerPlan.firstCall.args[1].taille, { exMat: 40 });
  });

  it("un job en échec (absent de completed) reste dans la file sans nomTauro", async () => {
    deps.queueControl.enqueueRun = sinon.stub().callsFake(async (aLancer) => {
      state.jobs.completed.push(aLancer[1]);
      return { total: 2, failed: 1, cancelled: 0 };
    });
    const res = fauxRes();
    await lancerTauro(req(), res, deps);
    assert.equal(res.statut, 200);
    assert.equal(state.jobs.jobs.length, 1);
    assert.equal(state.jobs.jobs[0]._id, 1);
    assert.equal(state.jobs.jobs[0].nomTauro, undefined);
    assert.equal(state.jobs.jobs[0], jobs[0], "l'objet d'origine, jamais la copie du plan");
  });

  it("progression : démarre sur les jobs du plan, et « end » ne part qu'après les étiquettes", async () => {
    await lancerTauro(req(), fauxRes(), deps);
    const { progression, broadcastWS } = deps;
    assert.deepEqual(
      progression.demarrer.firstCall.args[0].map((j) => j._id),
      [1, 2],
    );
    assert.equal(progression.demarrer.firstCall.args[1].concurrence(), 2);
    const fin = broadcastWS.getCalls().find((c) => c.args[0].type === "end");
    assert.ok(progression.etiquettes.calledBefore(deps.generateStickersForJobs));
    assert.ok(fin.calledAfter(deps.generateStickersForJobs.firstCall));
    assert.ok(progression.finir.calledAfter(deps.generateStickersForJobs));
    assert.ok(deps.queueControl.liberer.calledAfter(progression.finir));
  });

  it("progression : étiquettes en échec = avertissement, le lancement se termine", async () => {
    deps.generateStickersForJobs.rejects(new Error("modèle illisible"));
    const res = fauxRes();
    await lancerTauro(req(), res, deps);
    assert.equal(res.statut, 200);
    sinon.assert.calledOnceWithExactly(deps.progression.avertir, "Étiquettes non générées");
    sinon.assert.called(deps.progression.finir);
  });

  it("progression : une erreur du lancement la termine avec sa cause", async () => {
    deps.queueControl.enqueueRun = sinon.stub().rejects(new Error("Redis injoignable"));
    const res = fauxRes();
    await lancerTauro(req(), res, deps);
    assert.equal(res.statut, 500);
    sinon.assert.calledOnceWithExactly(deps.progression.finir, { erreur: "Redis injoignable" });
  });

  it("progression : un refus avant lancement ne touche pas à celle du lancement précédent", async () => {
    await lancerTauro(req({ empreinte: "autre" }), fauxRes(), deps);
    sinon.assert.notCalled(deps.progression.demarrer);
    sinon.assert.notCalled(deps.progression.finir);
  });

  it("étiquettes générées dans l'ordre Tauro", async () => {
    deps.queueControl.enqueueRun = sinon.stub().callsFake(async (aLancer) => {
      state.jobs.completed.push(aLancer[1], aLancer[0]);
      return { total: 2, failed: 0, cancelled: 0 };
    });
    await lancerTauro(req(), fauxRes(), deps);
    const etiquettes = deps.generateStickersForJobs.firstCall.args[0];
    assert.deepEqual(
      etiquettes.map((j) => j.ordreTauro),
      [1, 2],
    );
  });

  it("étiquettes hors session dans l'ordre de la file, pas dans l'ordre de fin", async () => {
    const hors = [
      { _id: 10, cmd: 1000, horsSession: true },
      { _id: 11, cmd: 1100, horsSession: true },
      { _id: 12, cmd: 1200 },
    ];
    deps.calculerPlan.resolves(plan([{ _id: 1, ordreTauro: 1 }, ...hors]));
    deps.queueControl.enqueueRun = sinon.stub().callsFake(async (aLancer) => {
      // Les workers finissent dans le désordre.
      state.jobs.completed.push(aLancer[3], aLancer[2], aLancer[0], aLancer[1]);
      return { total: 4, failed: 0, cancelled: 0 };
    });
    await lancerTauro(req(), fauxRes(), deps);
    assert.deepEqual(
      deps.generateStickersForJobs.firstCall.args[0].map((j) => j._id),
      [1, 10, 11, 12],
    );
  });

  it("aucun job à lancer : 400 et verrou libéré", async () => {
    deps.calculerPlan.resolves(plan([]));
    const res = fauxRes();
    await lancerTauro(req(), res, deps);
    assert.equal(res.statut, 400);
    assert.equal(res.corps.error, "Aucun job à lancer");
    assert.equal(deps.queueControl.etat.running, false);
  });

  it("disque plein : 507 et verrou libéré", async () => {
    deps.controlerEspaceDisque.returns({ code: "DISQUE_PLEIN", error: "Disque plein" });
    const res = fauxRes();
    await lancerTauro(req(), res, deps);
    assert.equal(res.statut, 507);
    assert.equal(deps.controlerEspaceDisque.firstCall.args[0].length, 2);
    assert.equal(deps.queueControl.enqueueRun.called, false);
    assert.equal(deps.queueControl.etat.running, false);
  });

  it("erreur inattendue : 500 et verrou libéré", async () => {
    deps.calculerPlan.rejects(new Error("Mongo indisponible"));
    const res = fauxRes();
    await lancerTauro(req(), res, deps);
    assert.equal(res.statut, 500);
    assert.equal(deps.queueControl.etat.running, false);
  });

  it("finition invalide : 400 sans réserver", async () => {
    const res = fauxRes();
    await lancerTauro(req({ finition: "SATIN" }), res, deps);
    assert.equal(res.statut, 400);
    assert.equal(deps.queueControl.reserver.called, false);
  });

  it("le bilan cite les sessions", async () => {
    deps.calculerPlan.resolves(
      plan(
        state.jobs.jobs.map((j, i) => ({ ...j, ordreTauro: i + 1 })),
        {
          sessions: [
            { code: "S1711A", depart: 1, dernier: 33 },
            { code: "S1711B", depart: 34, dernier: 68 },
          ],
        },
      ),
    );
    await lancerTauro(req(), fauxRes(), deps);
    const bilan = deps.logger.info.args.map((a) => a[0]).find((l) => l.startsWith("Traitement terminé"));
    assert.match(bilan, /Sessions S1711A \(001–033\), S1711B \(034–068\)/);
  });
});

describe("trierPourEtiquettes()", () => {
  it("ordreTauro croissant d'abord, puis les jobs sans ordre", () => {
    const sans = {};
    const trie = trierPourEtiquettes([{ ordreTauro: 3 }, sans, { ordreTauro: 1 }]);
    assert.deepEqual(trie, [{ ordreTauro: 1 }, { ordreTauro: 3 }, {}]);
    assert.equal(trie[2], sans);
  });

  it("stable : les jobs sans ordre gardent leur ordre d'entrée", () => {
    const a = { cmd: "a" };
    const b = { cmd: "b" };
    const c = { cmd: "c" };
    assert.deepEqual(
      trierPourEtiquettes([a, { ordreTauro: 2 }, b, c]).map((j) => j.cmd || j.ordreTauro),
      [2, "a", "b", "c"],
    );
  });
});

describe("resumeSessions() / validerOptionsTauro()", () => {
  it("hors session : N PDF", () => {
    assert.equal(resumeSessions({ sessions: [], horsSession: [{}, {}] }), "hors session : 2 PDF");
  });

  it("valide finition et relancer comme l'aperçu", () => {
    assert.equal(validerOptionsTauro({ finition: "bri", relancer: ["169034"] }), null);
    assert.match(validerOptionsTauro({ finition: "SATIN" }), /Finition invalide/);
    assert.match(validerOptionsTauro({ relancer: "169034" }), /relancer doit être une liste/);
  });

  it("valide la taille de session : entiers de 1 à 100, min ≤ max", () => {
    assert.equal(validerOptionsTauro({ taille: { exMat: 40, minBrillant: 10, maxBrillant: 30 } }), null);
    assert.equal(validerOptionsTauro({ taille: {} }), null);
    assert.match(validerOptionsTauro({ taille: { exMat: 0 } }), /Ex\. par session/);
    assert.match(validerOptionsTauro({ taille: { exMat: 12.5 } }), /Ex\. par session/);
    assert.match(validerOptionsTauro({ taille: { maxBrillant: 101 } }), /Ex\. par session/);
    assert.match(validerOptionsTauro({ taille: { minBrillant: 40, maxBrillant: 30 } }), /minimum.*maximum/);
    assert.match(validerOptionsTauro({ taille: "50" }), /taille/);
  });
});

// File de dépôt (fileDepot.js) : PDF de session déposés dans l'ordre d'impression.
describe("lancerTauro — file de dépôt dans l'ordre (attenteTauro)", () => {
  const path = require("path");
  const fileDepot = require("../../../server/src/tauro/fileDepot");
  let deps;
  let state;
  let ordre;

  beforeEach(() => {
    const jobs = [
      { _id: 1, cmd: 100, ex: 1 },
      { _id: 2, cmd: 200, ex: 1 },
      { _id: 3, cmd: 300, ex: 1, teinteMasse: true },
    ];
    state = {
      jobs: { jobs: [...jobs], completed: [] },
      paths: { attenteTauro: "\\NAS\temp", sessionPRINTSA: "PRINTSA#27 NOV 2026" },
    };
    const aLancer = jobs.map((j, i) => ({ ...j, nomTauro: `00${i + 1}_S2711A`, sessionTauro: "S2711A", ordreTauro: i + 1 }));
    ordre = [];
    deps = {
      state,
      queueControl: fauxQueueControl(),
      calculerPlan: sinon.stub().resolves({ empreinte: "abc", sessions: [], horsSession: [], aLancer }),
      controlerEspaceDisque: sinon.stub().returns(null),
      basculerSortieSecours: sinon.stub(),
      getConcurrency: () => 2,
      generateStickersForJobs: sinon.spy(async () => ordre.push("etiquettes")),
      broadcastWS: sinon.stub(),
      progression: { demarrer: sinon.stub(), etiquettes: sinon.stub(), avertir: sinon.stub(), finir: sinon.stub() },
      logger: { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() },
      tmpdir: () => "/tmp",
      deposerDepuisAttente: sinon.spy(async (job) => ordre.push(job.nomTauro)),
    };
    // Simule les workers : le job 2 finit avant le job 1, puis chaque job est soldé.
    deps.queueControl.enqueueRun = sinon.spy(async (enfiles, extra, opts) => {
      const file = fileDepot.courante();
      const parId = new Map(enfiles.map((j) => [j._id, j]));
      file.pret(2, path.join(parId.get(2).dossierAttente, "002_S2711A.pdf"));
      await new Promise((resolve) => setImmediate(resolve));
      file.pret(1, path.join(parId.get(1).dossierAttente, "001_S2711A.pdf"));
      [2, 1, 3].forEach((id) => opts.surFin(id, "fait"));
      return { total: 3, failed: 0, cancelled: 0 };
    });
  });

  afterEach(() => fileDepot.effacer());

  const req = () => ({
    ip: "::1",
    body: { run: true, tauro: { mode: "session", finition: "MAT", relancer: [], empreinte: "abc" } },
  });

  it("dépose dans l'ordre 001, 002 malgré la fin dans le désordre, puis les étiquettes", async () => {
    const res = fauxRes();
    await lancerTauro(req(), res, deps);
    assert.equal(res.statut, 200);
    assert.deepEqual(ordre, ["001_S2711A", "002_S2711A", "etiquettes"]);
  });

  it("teinte masse hors de la file ; dossier d'attente de la session posé sur les jobs de session", async () => {
    await lancerTauro(req(), fauxRes(), deps);
    const [enfiles, , opts] = deps.queueControl.enqueueRun.firstCall.args;
    const dossier = fileDepot.dossierAttente(state.paths);
    assert.deepEqual(
      enfiles.map((j) => j.dossierAttente),
      [dossier, dossier, undefined],
    );
    assert.equal(typeof opts.surFin, "function");
    assert.equal(opts.dejaReserve, true);
    assert.deepEqual(deps.controlerEspaceDisque.firstCall.args[3], { dossierAttente: dossier });
  });

  it("file effacée en fin de lancement", async () => {
    await lancerTauro(req(), fauxRes(), deps);
    assert.equal(fileDepot.courante(), null);
  });

  it("job sans PDF prêt (échec définitif) : sauté, les autres déposés, aucun avertissement", async () => {
    deps.queueControl.enqueueRun = sinon.spy(async (enfiles, extra, opts) => {
      fileDepot.courante().pret(2, "c2");
      [1, 2, 3].forEach((id) => opts.surFin(id, id === 1 ? "echec" : "fait"));
      return { total: 3, failed: 1, cancelled: 0 };
    });
    await lancerTauro(req(), fauxRes(), deps);
    assert.deepEqual(ordre, ["002_S2711A", "etiquettes"]);
    sinon.assert.notCalled(deps.progression.avertir);
  });

  it("sans attenteTauro : pas de file, dépôt direct comme avant", async () => {
    state.paths.attenteTauro = "";
    deps.queueControl.enqueueRun = sinon.stub().resolves({ total: 3, failed: 0, cancelled: 0 });
    await lancerTauro(req(), fauxRes(), deps);
    assert.deepEqual(deps.queueControl.enqueueRun.firstCall.args[2], { dejaReserve: true });
    assert.equal(deps.controlerEspaceDisque.firstCall.args[3], undefined);
  });
});
