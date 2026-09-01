const { expect } = require("chai");
const sinon = require("sinon");

const consommationPrixBackfillService = require("../../server/src/services/consommationPrixBackfillService");
const pkOnlyPrixBackfillService = require("../../server/src/services/pkOnlyPrixBackfillService");
const decoLivraisonDatesBackfillService = require("../../server/src/services/decoLivraisonDatesBackfillService");
const decoPrixBackfillService = require("../../server/src/services/decoPrixBackfillService");
const decoPrixVisuelBackfillService = require("../../server/src/services/decoPrixVisuelBackfillService");
const decoCommandeInfoBackfillService = require("../../server/src/services/decoCommandeInfoBackfillService");
const syntheseCommandesService = require("../../server/src/services/syntheseCommandesService");
const { backfillRecentDecoData } = require("../../server/src/services/startupPrixBackfillService");

describe("startupPrixBackfillService.backfillRecentDecoData()", () => {
  let backfillConsommationPrixStub;
  let backfillPkOnlyPrixTotalStub;
  let backfillDecoLivraisonDatesStub;
  let backfillDecoPrixStub;
  let backfillDecoPrixVisuelStub;
  let backfillDecoCommandeInfoStub;
  let chargerSyntheseCommandesStub;

  const resumeVide = { candidats: 0, misAJour: 0, introuvables: 0, erreurs: 0 };

  beforeEach(() => {
    chargerSyntheseCommandesStub = sinon
      .stub(syntheseCommandesService, "chargerSyntheseCommandes")
      .resolves(new Map());
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
    // decoLivraisonDates/decoPrix/decoCommandeInfo reçoivent en plus `synthese` → match partiel
    // qui épingle toujours sinceDate/concurrency/dryRun.
    expect(backfillDecoLivraisonDatesStub.calledWithMatch({ sinceDate, concurrency: 7, dryRun: true })).to.be.true;
    expect(backfillDecoPrixStub.calledWithMatch({ sinceDate, concurrency: 7, dryRun: true })).to.be.true;
    expect(backfillDecoPrixVisuelStub.calledWith({ sinceDate, dryRun: true })).to.be.true;
    expect(backfillDecoCommandeInfoStub.calledWithMatch({ sinceDate, concurrency: 7, dryRun: true })).to.be.true;
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
      "synthese",
      "consommationPrix",
      "pkOnlyPrixTotal",
      "decoLivraisonDates",
      "decoPrix",
      "decoPrixVisuel",
      "decoCommandeInfo",
    ]);
    expect(resultats.decoPrix).to.deep.equal(resumePrix);
  });

  it("charge la synthèse une fois et la passe aux étapes decoLivraisonDates/decoPrix/decoCommandeInfo", async () => {
    const fakeMap = new Map([[1, { prixTotal: 10 }]]);
    chargerSyntheseCommandesStub.resolves(fakeMap);

    const resultats = await backfillRecentDecoData({ sinceDate: new Date() });

    expect(chargerSyntheseCommandesStub.calledOnce).to.be.true;
    expect(backfillDecoLivraisonDatesStub.firstCall.args[0].synthese).to.equal(fakeMap);
    expect(backfillDecoPrixStub.firstCall.args[0].synthese).to.equal(fakeMap);
    expect(backfillDecoCommandeInfoStub.firstCall.args[0].synthese).to.equal(fakeMap);
    expect(resultats.synthese).to.deep.equal({ commandes: 1 });
  });

  it("continue sans synthèse (synthese: null passé) si chargerSyntheseCommandes échoue", async () => {
    chargerSyntheseCommandesStub.rejects(new Error("ODBC"));

    const resultats = await backfillRecentDecoData({ sinceDate: new Date() });

    expect(backfillDecoLivraisonDatesStub.firstCall.args[0].synthese).to.equal(null);
    expect(backfillDecoPrixStub.firstCall.args[0].synthese).to.equal(null);
    expect(backfillDecoCommandeInfoStub.firstCall.args[0].synthese).to.equal(null);
    expect(resultats.synthese).to.equal(null);
  });
});
