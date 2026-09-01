const { expect } = require("chai");
const sinon = require("sinon");

const consommationPrixBackfillService = require("../../server/src/services/consommationPrixBackfillService");
const pkOnlyPrixBackfillService = require("../../server/src/services/pkOnlyPrixBackfillService");
const decoLivraisonDatesBackfillService = require("../../server/src/services/decoLivraisonDatesBackfillService");
const decoPrixBackfillService = require("../../server/src/services/decoPrixBackfillService");
const decoPrixVisuelBackfillService = require("../../server/src/services/decoPrixVisuelBackfillService");
const decoCommandeInfoBackfillService = require("../../server/src/services/decoCommandeInfoBackfillService");
const { backfillRecentDecoData } = require("../../server/src/services/startupPrixBackfillService");

describe("startupPrixBackfillService.backfillRecentDecoData()", () => {
  let backfillConsommationPrixStub;
  let backfillPkOnlyPrixTotalStub;
  let backfillDecoLivraisonDatesStub;
  let backfillDecoPrixStub;
  let backfillDecoPrixVisuelStub;
  let backfillDecoCommandeInfoStub;

  const resumeVide = { candidats: 0, misAJour: 0, introuvables: 0, erreurs: 0 };

  beforeEach(() => {
    backfillConsommationPrixStub = sinon
      .stub(consommationPrixBackfillService, "backfillConsommationPrix")
      .resolves({ ...resumeVide });
    backfillPkOnlyPrixTotalStub = sinon
      .stub(pkOnlyPrixBackfillService, "backfillPkOnlyPrixTotal")
      .resolves({ ...resumeVide });
    backfillDecoLivraisonDatesStub = sinon
      .stub(decoLivraisonDatesBackfillService, "backfillDecoLivraisonDates")
      .resolves({ ...resumeVide });
    backfillDecoPrixStub = sinon.stub(decoPrixBackfillService, "backfillDecoPrix").resolves({ ...resumeVide });
    backfillDecoPrixVisuelStub = sinon
      .stub(decoPrixVisuelBackfillService, "backfillDecoPrixVisuel")
      .resolves({ ...resumeVide });
    backfillDecoCommandeInfoStub = sinon
      .stub(decoCommandeInfoBackfillService, "backfillDecoCommandeInfo")
      .resolves({ ...resumeVide });
  });

  afterEach(() => {
    sinon.restore();
  });

  it("appelle backfillConsommationPrix avant backfillPkOnlyPrixTotal (l'un dépend de l'autre)", async () => {
    const ordreAppels = [];
    backfillConsommationPrixStub.callsFake(async () => {
      ordreAppels.push("consommationPrix");
      return { ...resumeVide };
    });
    backfillPkOnlyPrixTotalStub.callsFake(async () => {
      ordreAppels.push("pkOnlyPrixTotal");
      return { ...resumeVide };
    });

    await backfillRecentDecoData({ sinceDate: new Date() });

    expect(ordreAppels).to.deep.equal(["consommationPrix", "pkOnlyPrixTotal"]);
  });

  it("propage sinceDate, concurrency et dryRun à chaque étape", async () => {
    const sinceDate = new Date("2026-08-18T00:00:00.000Z");

    await backfillRecentDecoData({ sinceDate, concurrency: 7, dryRun: true });

    expect(backfillConsommationPrixStub.calledWith({ sinceDate, concurrency: 7, dryRun: true })).to.be.true;
    expect(backfillPkOnlyPrixTotalStub.calledWith({ sinceDate, dryRun: true })).to.be.true;
    expect(backfillDecoLivraisonDatesStub.calledWith({ sinceDate, concurrency: 7, dryRun: true })).to.be.true;
    expect(backfillDecoPrixStub.calledWith({ sinceDate, concurrency: 7, dryRun: true })).to.be.true;
    expect(backfillDecoPrixVisuelStub.calledWith({ sinceDate, dryRun: true })).to.be.true;
    expect(backfillDecoCommandeInfoStub.calledWith({ sinceDate, concurrency: 7, dryRun: true })).to.be.true;
  });

  it("utilise concurrency=3 par défaut", async () => {
    await backfillRecentDecoData({ sinceDate: new Date() });

    expect(backfillConsommationPrixStub.firstCall.args[0].concurrency).to.equal(3);
    expect(backfillDecoLivraisonDatesStub.firstCall.args[0].concurrency).to.equal(3);
    expect(backfillDecoPrixStub.firstCall.args[0].concurrency).to.equal(3);
  });

  it("continue les étapes suivantes si une étape lève une exception", async () => {
    backfillConsommationPrixStub.rejects(new Error("ODBC indisponible"));

    const resultats = await backfillRecentDecoData({ sinceDate: new Date() });

    expect(resultats.consommationPrix).to.be.null;
    expect(backfillPkOnlyPrixTotalStub.calledOnce).to.be.true;
    expect(backfillDecoLivraisonDatesStub.calledOnce).to.be.true;
    expect(backfillDecoPrixStub.calledOnce).to.be.true;
    expect(backfillDecoPrixVisuelStub.calledOnce).to.be.true;
    expect(backfillDecoCommandeInfoStub.calledOnce).to.be.true;
  });

  it("retourne le résumé de chaque étape sous forme d'objet nommé", async () => {
    const resumePrix = { candidats: 5, misAJour: 3, introuvables: 2, erreurs: 0 };
    backfillDecoPrixStub.resolves(resumePrix);

    const resultats = await backfillRecentDecoData({ sinceDate: new Date() });

    expect(resultats).to.have.all.keys([
      "consommationPrix",
      "pkOnlyPrixTotal",
      "decoLivraisonDates",
      "decoPrix",
      "decoPrixVisuel",
      "decoCommandeInfo",
    ]);
    expect(resultats.decoPrix).to.deep.equal(resumePrix);
  });
});
