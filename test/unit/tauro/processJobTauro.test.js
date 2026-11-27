"use strict";
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sinon = require("sinon");
const { UnrecoverableError } = require("bullmq");
const Module = require("module");
const { deposerPdf, inscrireSansPdf, _reinitialiserDepots } = require("../../../server/src/tauro/depotTauro");

// Étape de dépôt de processJob (jobsController ne se charge pas sans Redis) : dépendances injectées.
describe("processJob — dépôt Tauro (deposerPdf)", () => {
  let dossier;
  let stagedPdfPath;
  let deps;
  let log;

  const hf = path.join("HotFolderRoot", "Deco_Std_151x260");
  const jobSession = () => ({
    _id: 1731830000000,
    cmd: 169034,
    ex: 4,
    writePath: hf,
    nomTauro: "011_S1711A_151x260_W_MAT_169034_BETON-CLAIR-150x255_4",
    sessionTauro: "S1711A",
    ordreTauro: 11,
    hfTauro: "Deco_Std_151x260",
    clesTauro: ["169034/BETON CLAIR"],
    signatureTauro: "sig",
    visuPath: "/source/BETON CLAIR 150x255 MAT.pdf",
  });
  const pdfBaseName = "169034 - LM AMIENS - 151x260 - BETON CLAIR 150x255 MAT 4_EX.pdf";

  beforeEach(() => {
    dossier = fs.mkdtempSync(path.join(os.tmpdir(), "decogestion-depot-"));
    stagedPdfPath = path.join(dossier, pdfBaseName);
    fs.writeFileSync(stagedPdfPath, "%PDF-1.7 contenu");
    deps = {
      deliverToHotFolder: sinon.stub().resolves(),
      dejaInscrit: sinon.stub().resolves(false),
      inscrire: sinon.stub().resolves(),
      broadcastWS: sinon.stub(),
    };
    log = { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() };
    _reinitialiserDepots();
  });

  afterEach(() => fs.rmSync(dossier, { recursive: true, force: true }));

  it("dejaInscrit vrai : rien n'est déposé ni réinscrit", async () => {
    deps.dejaInscrit.resolves(true);
    await deposerPdf(jobSession(), { stagedPdfPath, pdfBaseName, log, deps });
    sinon.assert.notCalled(deps.deliverToHotFolder);
    sinon.assert.notCalled(deps.inscrire);
    assert.ok(log.info.calledWithMatch(/déjà déposé \(journal\), rien n'est recopié/));
  });

  it("session : dépôt exclusif sous le nom Tauro puis inscription au journal", async () => {
    const job = jobSession();
    await deposerPdf(job, { stagedPdfPath, pdfBaseName, log, deps });
    sinon.assert.calledOnceWithExactly(
      deps.deliverToHotFolder,
      stagedPdfPath,
      path.join(hf, "011_S1711A_151x260_W_MAT_169034_BETON-CLAIR-150x255_4.pdf"),
      { exclusif: true },
    );
    sinon.assert.calledOnce(deps.inscrire);
    const [jobInscrit, opts] = deps.inscrire.firstCall.args;
    assert.equal(jobInscrit, job);
    assert.equal(opts.source, job.visuPath);
    assert.equal(opts.octets, Buffer.byteLength("%PDF-1.7 contenu"));
    assert.ok(deps.inscrire.calledAfter(deps.deliverToHotFolder));
    sinon.assert.notCalled(log.warn);
  });

  it("hors session : dépôt exclusif sous le nom decoGestion, mode hors-session", async () => {
    const job = { ...jobSession(), nomTauro: undefined, sessionTauro: undefined, horsSession: true, nomOrigine: "x" };
    await deposerPdf(job, { stagedPdfPath, pdfBaseName, log, deps });
    sinon.assert.calledOnceWithExactly(deps.deliverToHotFolder, stagedPdfPath, path.join(hf, pdfBaseName), {
      exclusif: true,
    });
    assert.equal(deps.inscrire.firstCall.args[1].mode, "hors-session");
  });

  it("inscrire rejette : pas d'échec du job, erreur journalisée et jobWarning diffusé", async () => {
    deps.inscrire.rejects(new Error("Mongo HS"));
    const job = jobSession();
    await deposerPdf(job, { stagedPdfPath, pdfBaseName, log, deps });
    sinon.assert.calledOnce(log.error);
    sinon.assert.calledOnce(deps.broadcastWS);
    const msg = deps.broadcastWS.firstCall.args[0];
    assert.equal(msg.type, "jobWarning");
    assert.equal(msg.job, job);
    assert.match(msg.reason, /Mongo HS/);
  });

  it("UnrecoverableError relancée telle quelle, sans inscription", async () => {
    const err = new UnrecoverableError("Déjà présent dans Deco_Std_151x260 : x.pdf");
    deps.deliverToHotFolder.rejects(err);
    await assert.rejects(
      () => deposerPdf(jobSession(), { stagedPdfPath, pdfBaseName, log, deps }),
      (e) => e === err,
    );
    sinon.assert.notCalled(deps.inscrire);
  });

  it("hot folder différent de hfTauro : avertissement", async () => {
    const job = { ...jobSession(), hfTauro: "Prod avec BLANC" };
    await deposerPdf(job, { stagedPdfPath, pdfBaseName, log, deps });
    sinon.assert.calledOnce(log.warn);
    sinon.assert.calledOnce(deps.deliverToHotFolder);
  });

  it("job sans Tauro : dépôt comme aujourd'hui (pas d'option, pas de journal)", async () => {
    const job = { cmd: 1, writePath: hf };
    await deposerPdf(job, { stagedPdfPath, pdfBaseName, log, deps });
    sinon.assert.calledOnce(deps.deliverToHotFolder);
    assert.deepEqual(deps.deliverToHotFolder.firstCall.args, [stagedPdfPath, path.join(hf, pdfBaseName)]);
    sinon.assert.notCalled(deps.dejaInscrit);
    sinon.assert.notCalled(deps.inscrire);
  });

  it("journal en échec puis retentative : le PDF n'est pas redéposé (garde en mémoire)", async () => {
    deps.inscrire.rejects(new Error("Mongo HS"));
    const job = jobSession();
    await deposerPdf(job, { stagedPdfPath, pdfBaseName, log, deps });
    sinon.assert.calledOnce(deps.deliverToHotFolder);

    await deposerPdf(job, { stagedPdfPath, pdfBaseName, log, deps });
    sinon.assert.calledOnce(deps.deliverToHotFolder);
    sinon.assert.calledOnce(deps.inscrire);
    assert.ok(log.info.calledWithMatch(/déjà déposé \(journal\), rien n'est recopié/));
  });

  it("deux dépôts simultanés du même job Tauro : un seul PDF déposé", async () => {
    const finirs = [];
    deps.deliverToHotFolder = sinon.stub().callsFake(() => new Promise((r) => finirs.push(r)));
    const job = jobSession();
    const premier = deposerPdf(job, { stagedPdfPath, pdfBaseName, log, deps });
    // Le premier est en pleine copie (lente) quand le doublon arrive.
    await new Promise((r) => setTimeout(r, 20));
    const doublon = deposerPdf(job, { stagedPdfPath, pdfBaseName, log, deps });
    await new Promise((r) => setTimeout(r, 20));
    finirs.forEach((f) => f());
    await Promise.all([premier, doublon]);
    sinon.assert.calledOnce(deps.deliverToHotFolder);
    sinon.assert.calledOnce(deps.inscrire);
  });

  it("copie en échec : la garde est levée, une vraie retentative redépose", async () => {
    deps.deliverToHotFolder = sinon.stub();
    deps.deliverToHotFolder.onFirstCall().rejects(new Error("réseau coupé"));
    deps.deliverToHotFolder.onSecondCall().resolves();
    const job = jobSession();
    await assert.rejects(() => deposerPdf(job, { stagedPdfPath, pdfBaseName, log, deps }), /réseau coupé/);
    await deposerPdf(job, { stagedPdfPath, pdfBaseName, log, deps });
    sinon.assert.calledTwice(deps.deliverToHotFolder);
    sinon.assert.calledOnce(deps.inscrire);
  });

  it("job sans Tauro : le module journal n'est pas chargé", async () => {
    const original = Module._load;
    Module._load = function (request, ...args) {
      if (/journalTauro|websocketService/.test(request)) throw new Error(`chargé à tort : ${request}`);
      return original.call(this, request, ...args);
    };
    try {
      const deliverToHotFolder = sinon.stub().resolves();
      await deposerPdf({ cmd: 1, writePath: hf }, { stagedPdfPath, pdfBaseName, log, deps: { deliverToHotFolder } });
      sinon.assert.calledOnce(deliverToHotFolder);
    } finally {
      Module._load = original;
    }
  });
});

describe("processJob — teinte masse en session (inscrireSansPdf)", () => {
  let deps;
  let log;
  const tm = () => ({
    _id: 1731830000001,
    cmd: 169500,
    ex: 4,
    teinteMasse: true,
    nomTauro: "012_S1711A_101x215_MAT_169500_BLANC-ZERO-100x210_4",
    sessionTauro: "S1711A",
    ordreTauro: 12,
    hfTauro: "Deco_Std_101x215",
    clesTauro: ["169500/02"],
    signatureTauro: "sig",
  });

  beforeEach(() => {
    deps = {
      dejaInscrit: sinon.stub().resolves(false),
      inscrire: sinon.stub().resolves(),
      broadcastWS: sinon.stub(),
    };
    log = { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() };
  });

  it("inscrite au journal en mode session", async () => {
    const job = tm();
    await inscrireSansPdf(job, { log, deps });
    sinon.assert.calledOnceWithExactly(deps.inscrire, job, { mode: "session" });
  });

  it("déjà inscrite (retentative) : pas de 2e inscription", async () => {
    deps.dejaInscrit.resolves(true);
    await inscrireSansPdf(tm(), { log, deps });
    sinon.assert.notCalled(deps.inscrire);
  });

  it("hors session ou lancement classique (sans nomTauro) : rien", async () => {
    await inscrireSansPdf({ ...tm(), nomTauro: undefined }, { log, deps });
    sinon.assert.notCalled(deps.dejaInscrit);
    sinon.assert.notCalled(deps.inscrire);
  });

  it("journal en panne : avertissement, le job n'échoue pas", async () => {
    deps.inscrire.rejects(new Error("Mongo HS"));
    await inscrireSansPdf(tm(), { log, deps });
    sinon.assert.calledOnce(log.error);
    assert.equal(deps.broadcastWS.firstCall.args[0].type, "jobWarning");
  });
});

// File de dépôt (fileDepot.js) : copie dans l'attente, puis dépôt à son tour depuis l'attente.
describe("dépôt Tauro via le dossier d'attente", () => {
  const { copierEnAttente, deposerDepuisAttente } = require("../../../server/src/tauro/depotTauro");
  let dossier;
  let deps;
  let log;

  const jobSession = () => ({
    _id: 1731830000099,
    cmd: 169034,
    ex: 4,
    writePath: path.join("HotFolderRoot", "Deco_Std_151x260"),
    nomTauro: "011_S2711A_151x260_W_MAT_169034_BETON-CLAIR-150x255_4",
    hfTauro: "Deco_Std_151x260",
    clesTauro: ["169034/BETON CLAIR"],
    visuPath: "/source/BETON CLAIR 150x255 MAT.pdf",
  });

  beforeEach(() => {
    dossier = fs.mkdtempSync(path.join(os.tmpdir(), "decogestion-attente-"));
    deps = {
      deliverToHotFolder: sinon.stub().resolves(),
      dejaInscrit: sinon.stub().resolves(false),
      inscrire: sinon.stub().resolves(),
      broadcastWS: sinon.stub(),
    };
    log = { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() };
    _reinitialiserDepots();
  });

  afterEach(() => fs.rmSync(dossier, { recursive: true, force: true }));

  it("copierEnAttente : copie sous le nom Tauro, crée le dossier, écrase un fichier non déposé", async () => {
    const staged = path.join(dossier, "staged.pdf");
    fs.writeFileSync(staged, "%PDF-1.7 v2");
    const attente = path.join(dossier, "PRINTSA#27 NOV 2026");
    fs.mkdirSync(attente);
    fs.writeFileSync(path.join(attente, `${jobSession().nomTauro}.pdf`), "ancien");

    const chemin = await copierEnAttente(jobSession(), { stagedPdfPath: staged, dossier: attente, log });

    assert.equal(chemin, path.join(attente, `${jobSession().nomTauro}.pdf`));
    assert.equal(fs.readFileSync(chemin, "utf8"), "%PDF-1.7 v2");
    sinon.assert.notCalled(deps.deliverToHotFolder);
  });

  it("deposerDepuisAttente : dépôt exclusif sous le nom Tauro, journal, puis fichier d'attente supprimé", async () => {
    const job = jobSession();
    const chemin = path.join(dossier, `${job.nomTauro}.pdf`);
    fs.writeFileSync(chemin, "%PDF-1.7");

    await deposerDepuisAttente(job, chemin, { log, deps });

    sinon.assert.calledOnceWithExactly(deps.deliverToHotFolder, chemin, path.join(job.writePath, `${job.nomTauro}.pdf`), {
      exclusif: true,
    });
    sinon.assert.calledOnce(deps.inscrire);
    assert.equal(deps.inscrire.firstCall.args[1].mode, "session");
    assert.equal(fs.existsSync(chemin), false);
  });

  it("deposerDepuisAttente : déjà présent (UnrecoverableError) remonte, le fichier d'attente reste", async () => {
    const job = jobSession();
    const chemin = path.join(dossier, `${job.nomTauro}.pdf`);
    fs.writeFileSync(chemin, "%PDF-1.7");
    deps.deliverToHotFolder.rejects(new UnrecoverableError("Déjà présent"));

    await assert.rejects(deposerDepuisAttente(job, chemin, { log, deps }), UnrecoverableError);
    sinon.assert.notCalled(deps.inscrire);
    assert.equal(fs.existsSync(chemin), true);
  });

  it("deposerDepuisAttente : déjà au journal, rien n'est redéposé et l'attente est vidée", async () => {
    const job = jobSession();
    const chemin = path.join(dossier, `${job.nomTauro}.pdf`);
    fs.writeFileSync(chemin, "%PDF-1.7");
    deps.dejaInscrit.resolves(true);

    await deposerDepuisAttente(job, chemin, { log, deps });
    sinon.assert.notCalled(deps.deliverToHotFolder);
    assert.equal(fs.existsSync(chemin), false);
  });
});
