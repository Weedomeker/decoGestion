"use strict";
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sinon = require("sinon");
const { UnrecoverableError } = require("bullmq");
const { deposerPdf } = require("../../../server/src/tauro/depotTauro");

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
});
