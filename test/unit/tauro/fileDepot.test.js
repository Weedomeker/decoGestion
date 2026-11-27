"use strict";
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sinon = require("sinon");
const { UnrecoverableError } = require("bullmq");
const {
  creerFileDepot,
  dossierAttente,
  nettoyerAttente,
  listerAttente,
  reprendreDepot,
  definir,
  effacer,
  courante,
} = require("../../../server/src/tauro/fileDepot");

const job = (n) => ({ _id: 1000 + n, cmd: 169000 + n, ordreTauro: n, nomTauro: `00${n}_S2711A_151x260_W_MAT` });
const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("file de dépôt Tauro (fileDepot)", () => {
  let log;
  let deposes;
  let deposer;
  let broadcastWS;

  beforeEach(() => {
    log = { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() };
    deposes = [];
    deposer = sinon.spy(async (j) => {
      deposes.push(j.ordreTauro);
    });
    broadcastWS = sinon.stub();
  });

  const creer = (jobs, opts = {}) =>
    creerFileDepot(jobs, { deposer, log, broadcastWS, delaisMs: [0, 0], attendre: async () => {}, ...opts });

  it("prêts dans le désordre (3, 1, 2) : déposés dans l'ordre 1, 2, 3", async () => {
    const file = creer([job(1), job(2), job(3)]);
    file.pret(1003, "c3");
    await tick();
    assert.deepEqual(deposes, []);
    file.pret(1001, "c1");
    await tick();
    assert.deepEqual(deposes, [1]);
    file.pret(1002, "c2");
    await file.vider();
    assert.deepEqual(deposes, [1, 2, 3]);
    assert.deepEqual(file.bilan().deposes.length, 3);
  });

  it("trie par ordreTauro quel que soit l'ordre reçu", async () => {
    const file = creer([job(2), job(1)]);
    file.pret(1002, "c2");
    file.pret(1001, "c1");
    await file.vider();
    assert.deepEqual(deposes, [1, 2]);
  });

  it("job soldé sans avoir été prêt : son n° est sauté", async () => {
    const file = creer([job(1), job(2), job(3)]);
    file.pret(1003, "c3");
    file.pret(1001, "c1");
    file.solder(1001);
    file.solder(1002);
    file.solder(1003);
    await file.vider();
    assert.deepEqual(deposes, [1, 3]);
    assert.deepEqual(file.bilan().ecartes, ["002_S2711A_151x260_W_MAT.pdf"]);
  });

  it("job relancé : les suivants l'attendent tant qu'il n'est pas soldé", async () => {
    const file = creer([job(1), job(2)]);
    file.pret(1002, "c2");
    await tick();
    assert.deepEqual(deposes, []);
    // 1re tentative du job 1 en échec, relance réussie : prêt plus tard, jamais soldé entre-temps.
    file.pret(1001, "c1");
    await file.vider();
    assert.deepEqual(deposes, [1, 2]);
  });

  it("pret après dépôt (doublon) : refusé, rien n'est redéposé", async () => {
    const file = creer([job(1)]);
    assert.equal(file.pret(1001, "c1"), true);
    await file.vider();
    assert.equal(file.pret(1001, "c1"), false);
    await tick();
    assert.equal(deposer.callCount, 1);
  });

  it("solder après dépôt : sans effet", async () => {
    const file = creer([job(1)]);
    file.pret(1001, "c1");
    await file.vider();
    file.solder(1001);
    assert.deepEqual(file.bilan(), { deposes: ["001_S2711A_151x260_W_MAT.pdf"], ecartes: [], restes: [] });
  });

  it("échec passager : nouvel essai, l'ordre est gardé", async () => {
    let echecs = 1;
    deposer = sinon.spy(async (j) => {
      if (j.ordreTauro === 1 && echecs-- > 0) throw new Error("EBUSY");
      deposes.push(j.ordreTauro);
    });
    const file = creer([job(1), job(2)], { deposer });
    file.pret(1002, "c2");
    file.pret(1001, "c1");
    await file.vider();
    assert.deepEqual(deposes, [1, 2]);
    assert.equal(deposer.callCount, 3);
  });

  it("dépôt impossible après tous les essais : arrêt, les suivants restent en attente", async () => {
    deposer = sinon.spy(async (j) => {
      if (j.ordreTauro === 2) throw new Error("ENOENT hot folder");
      deposes.push(j.ordreTauro);
    });
    const file = creer([job(1), job(2), job(3)], { deposer });
    file.pret(1001, "c1");
    file.pret(1002, "c2");
    file.pret(1003, "c3");
    await file.vider();
    assert.deepEqual(deposes, [1]);
    assert.equal(deposer.callCount, 1 + 3); // job 1, puis 3 essais du job 2
    assert.deepEqual(file.bilan().restes, ["002_S2711A_151x260_W_MAT.pdf", "003_S2711A_151x260_W_MAT.pdf"]);
    sinon.assert.calledWithMatch(broadcastWS, { type: "jobError", reason: sinon.match(/002_S2711A.*003_S2711A/) });
  });

  it("déjà présent dans le hot folder (UnrecoverableError) : sauté, sans nouvel essai, la file continue", async () => {
    deposer = sinon.spy(async (j) => {
      if (j.ordreTauro === 1) throw new UnrecoverableError("Déjà présent");
      deposes.push(j.ordreTauro);
    });
    const file = creer([job(1), job(2)], { deposer });
    file.pret(1001, "c1");
    file.pret(1002, "c2");
    await file.vider();
    assert.deepEqual(deposes, [2]);
    assert.equal(deposer.callCount, 2);
    assert.deepEqual(file.bilan().ecartes, ["001_S2711A_151x260_W_MAT.pdf"]);
  });

  it("vider attend la fin de tous les jobs, puis se résout", async () => {
    const file = creer([job(1), job(2)]);
    let fini = false;
    const attente = file.vider().then(() => {
      fini = true;
    });
    file.pret(1001, "c1");
    await tick();
    assert.equal(fini, false);
    file.solder(1002);
    await attente;
    assert.equal(fini, true);
    assert.deepEqual(deposes, [1]);
  });

  it("prêt pendant un dépôt en cours : déposé juste après, sans être oublié", async () => {
    let finir;
    deposer = sinon.spy((j) => {
      deposes.push(j.ordreTauro);
      if (j.ordreTauro === 1) return new Promise((resolve) => (finir = resolve));
      return Promise.resolve();
    });
    const file = creer([job(1), job(2)], { deposer });
    file.pret(1001, "c1");
    await tick();
    file.pret(1002, "c2");
    finir();
    await file.vider();
    assert.deepEqual(deposes, [1, 2]);
  });

  it("etat : suit le job jusqu'au dépôt, undefined hors file", async () => {
    const file = creer([job(1)]);
    assert.equal(file.etat(1001), "attente");
    file.pret(1001, "c1");
    await file.vider();
    assert.equal(file.etat(1001), "depose");
    assert.equal(file.etat(9999), undefined);
  });

  it("attend : seuls les jobs de la file", () => {
    const file = creer([job(1)]);
    assert.equal(file.attend(1001), true);
    assert.equal(file.attend("1001"), true);
    assert.equal(file.attend(9999), false);
  });

  it("definir / courante / effacer", () => {
    const file = creer([job(1)]);
    definir(file);
    assert.equal(courante(), file);
    effacer();
    assert.equal(courante(), null);
  });

  describe("dossierAttente", () => {
    const paths = { attenteTauro: "\\\\NASSYNORS1221\\temp", sessionPRINTSA: "PRINTSA#27 NOV 2026" };

    it("vide sans attenteTauro : fonction désactivée", () => {
      assert.equal(dossierAttente({ sessionPRINTSA: "PRINTSA#X" }), "");
      assert.equal(dossierAttente({ attenteTauro: "  ", sessionPRINTSA: "PRINTSA#X" }), "");
    });

    it("production : dossier de la session du jour", () => {
      assert.equal(dossierAttente(paths, { env: "production" }), path.join(paths.attenteTauro, paths.sessionPRINTSA));
    });

    it("dev : sous-dossier dev, jamais celui de la production", () => {
      assert.equal(
        dossierAttente(paths, { env: "development" }),
        path.join(paths.attenteTauro, "dev", paths.sessionPRINTSA),
      );
    });
  });

  describe("reprendreDepot", () => {
    let dossier;
    beforeEach(() => {
      dossier = fs.mkdtempSync(path.join(os.tmpdir(), "decogestion-reprise-"));
    });
    afterEach(() => fs.rmSync(dossier, { recursive: true, force: true }));

    const poser = (n, { fiche = true } = {}) => {
      const j = job(n);
      const chemin = path.join(dossier, `${j.nomTauro}.pdf`);
      fs.writeFileSync(chemin, "%PDF");
      if (fiche) fs.writeFileSync(chemin.replace(/\.pdf$/, ".json"), JSON.stringify(j));
      return chemin;
    };

    it("dépose dans l'ordre les PDF qui ont une fiche, signale ceux qui n'en ont pas", async () => {
      poser(3);
      poser(1);
      poser(2, { fiche: false });
      const chemins = [];
      const deposerReel = sinon.spy(async (j, chemin) => {
        deposes.push(j.ordreTauro);
        chemins.push(path.basename(chemin));
      });
      const bilan = await reprendreDepot(dossier, { deposer: deposerReel, log, broadcastWS });
      assert.deepEqual(deposes, [1, 3]);
      assert.deepEqual(chemins, ["001_S2711A_151x260_W_MAT.pdf", "003_S2711A_151x260_W_MAT.pdf"]);
      assert.deepEqual(bilan.sansFiche, ["002_S2711A_151x260_W_MAT.pdf"]);
      assert.equal(bilan.deposes.length, 2);
    });

    it("hot folder toujours injoignable : arrêt, rien n'est perdu", async () => {
      poser(1);
      poser(2);
      const bilan = await reprendreDepot(dossier, {
        deposer: sinon.stub().rejects(new Error("injoignable")),
        log,
        broadcastWS,
        delaisMs: [],
        attendre: async () => {},
      });
      assert.deepEqual(bilan.restes, ["001_S2711A_151x260_W_MAT.pdf", "002_S2711A_151x260_W_MAT.pdf"]);
      assert.deepEqual(await listerAttente(dossier), ["001_S2711A_151x260_W_MAT.pdf", "002_S2711A_151x260_W_MAT.pdf"]);
    });

    it("dossier absent : rien à reprendre", async () => {
      const bilan = await reprendreDepot(path.join(dossier, "absent"), { deposer, log, broadcastWS });
      assert.deepEqual(bilan, { deposes: [], ecartes: [], restes: [], sansFiche: [] });
    });

    it("listerAttente : PDF seulement, triés par nom", async () => {
      poser(2);
      poser(1);
      fs.writeFileSync(path.join(dossier, "x.pdf.part"), "");
      assert.deepEqual(await listerAttente(dossier), ["001_S2711A_151x260_W_MAT.pdf", "002_S2711A_151x260_W_MAT.pdf"]);
      assert.deepEqual(await listerAttente(""), []);
    });
  });

  describe("nettoyerAttente", () => {
    let dossier;
    beforeEach(() => {
      dossier = fs.mkdtempSync(path.join(os.tmpdir(), "decogestion-attente-"));
    });
    afterEach(() => fs.rmSync(dossier, { recursive: true, force: true }));

    it("supprime les PDF (et fiches) des jobs retirés, liste les autres sans les toucher", async () => {
      fs.writeFileSync(path.join(dossier, "001_S2711A.pdf"), "x");
      fs.writeFileSync(path.join(dossier, "001_S2711A.json"), "{}");
      fs.writeFileSync(path.join(dossier, "002_S2711A.pdf"), "x");
      const bilan = await nettoyerAttente(
        [path.join(dossier, "001_S2711A.pdf"), path.join(dossier, "absent.pdf")],
        dossier,
      );
      assert.deepEqual(bilan, { supprimes: ["001_S2711A.pdf"], restants: ["002_S2711A.pdf"] });
      assert.equal(fs.existsSync(path.join(dossier, "002_S2711A.pdf")), true);
      assert.equal(fs.existsSync(path.join(dossier, "001_S2711A.json")), false);
    });

    it("dossier du jour absent ou non configuré : rien à signaler", async () => {
      assert.deepEqual(await nettoyerAttente([], path.join(dossier, "inexistant")), { supprimes: [], restants: [] });
      assert.deepEqual(await nettoyerAttente([], ""), { supprimes: [], restants: [] });
    });
  });
});
