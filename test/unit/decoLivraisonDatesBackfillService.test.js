const { expect } = require("chai");
const sinon = require("sinon");

const dossierService = require("../../server/src/gamesys/services/dossierService");
const dbConfig = require("../../server/src/gamesys/config/db");
const Deco = require("../../server/src/models/Deco");
const { backfillDecoLivraisonDates } = require("../../server/src/services/decoLivraisonDatesBackfillService");

describe("decoLivraisonDatesBackfillService.backfillDecoLivraisonDates()", () => {
  let findStub;
  let updateManyStub;
  let getDbConnectionStub;
  let fetchDossierLivraisonDatesStub;
  let fakeConnection;

  beforeEach(() => {
    fakeConnection = { close: sinon.stub().resolves() };
    findStub = sinon.stub(Deco, "find").returns({ lean: sinon.stub() });
    updateManyStub = sinon.stub(Deco, "updateMany").resolves({ modifiedCount: 0 });
    getDbConnectionStub = sinon.stub(dbConfig, "getDbConnection").resolves(fakeConnection);
    fetchDossierLivraisonDatesStub = sinon.stub(dossierService, "fetchDossierLivraisonDates");
  });

  afterEach(() => {
    sinon.restore();
  });

  function mockPendingDocs(docs) {
    findStub.returns({ lean: sinon.stub().resolves(docs) });
  }

  it("interroge Deco sur les documents avec numCmd>0 sans dateLivraisonSouhaitee ou sans mag", async () => {
    mockPendingDocs([]);

    await backfillDecoLivraisonDates({ dryRun: false });

    expect(findStub.calledOnce).to.be.true;
    expect(findStub.firstCall.args[0]).to.deep.equal({
      numCmd: { $gt: 0 },
      $or: [{ dateLivraisonSouhaitee: { $exists: false } }, { mag: { $exists: false } }],
    });
  });

  it("ajoute createdAt au filtre quand sinceDate est fourni", async () => {
    mockPendingDocs([]);
    const sinceDate = new Date("2026-08-18T00:00:00.000Z");

    await backfillDecoLivraisonDates({ dryRun: false, sinceDate });

    expect(findStub.firstCall.args[0]).to.deep.equal({
      numCmd: { $gt: 0 },
      $or: [{ dateLivraisonSouhaitee: { $exists: false } }, { mag: { $exists: false } }],
      createdAt: { $gte: sinceDate },
    });
  });

  it("ne modifie rien en dry-run", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 100473, client: "LM" }]);

    const resume = await backfillDecoLivraisonDates({ dryRun: true });

    expect(resume.candidats).to.equal(1);
    expect(getDbConnectionStub.called).to.be.false;
    expect(updateManyStub.called).to.be.false;
  });

  it("déduplique par numCmd : un seul appel Gamesys pour plusieurs documents partageant le même numCmd", async () => {
    mockPendingDocs([
      { _id: "a", numCmd: 165675, client: "LM" },
      { _id: "b", numCmd: 165675, client: "LM" },
    ]);
    fetchDossierLivraisonDatesStub
      .withArgs(fakeConnection, 165675)
      .resolves({
        dateDepartUsine: new Date("2025-02-20"),
        dateLivraisonSouhaitee: new Date("2025-03-01"),
        magasin: "NOM DESTINATAIRE",
        ville: "PARIS",
      });
    updateManyStub.resolves({ modifiedCount: 2 });

    const resume = await backfillDecoLivraisonDates({ dryRun: false });

    expect(fetchDossierLivraisonDatesStub.callCount).to.equal(1);
    expect(
      updateManyStub.calledWith(
        {
          numCmd: 165675,
          $or: [{ dateLivraisonSouhaitee: { $exists: false } }, { mag: { $exists: false } }],
        },
        { $set: { dateLivraisonSouhaitee: new Date("2025-03-01"), mag: "PARIS" } },
      ),
    ).to.be.true;
    expect(resume.misAJour).to.equal(2);
    expect(fakeConnection.close.calledOnce).to.be.true;
  });

  it("pose mag = ville pour les clients non-ECOM quand Gamesys renvoie les deux", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 165675, client: "LM" }]);
    fetchDossierLivraisonDatesStub.resolves({
      dateLivraisonSouhaitee: new Date("2025-03-01"),
      dateDepartUsine: null,
      magasin: "NOM DESTINATAIRE",
      ville: "MONTPELLIER",
    });
    updateManyStub.resolves({ modifiedCount: 1 });

    await backfillDecoLivraisonDates({ dryRun: false });

    const setArg = updateManyStub.firstCall.args[1];
    expect(setArg.$set.mag).to.equal("MONTPELLIER");
  });

  it("pose mag = magasin pour les clients ECOM quand Gamesys renvoie les deux", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 165675, client: "ECOM" }]);
    fetchDossierLivraisonDatesStub.resolves({
      dateLivraisonSouhaitee: new Date("2025-03-01"),
      dateDepartUsine: null,
      magasin: "JEAN DUPONT",
      ville: "BORDEAUX",
    });
    updateManyStub.resolves({ modifiedCount: 1 });

    await backfillDecoLivraisonDates({ dryRun: false });

    const setArg = updateManyStub.firstCall.args[1];
    expect(setArg.$set.mag).to.equal("JEAN DUPONT");
  });

  it("ne compte pas introuvable si Gamesys renvoie mag sans date, et met à jour", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 111111, client: "LM" }]);
    fetchDossierLivraisonDatesStub.resolves({
      dateLivraisonSouhaitee: null,
      dateDepartUsine: null,
      magasin: null,
      ville: "LYON",
    });
    updateManyStub.resolves({ modifiedCount: 1 });

    const resume = await backfillDecoLivraisonDates({ dryRun: false });

    expect(resume.introuvables).to.equal(0);
    expect(resume.misAJour).to.equal(1);
    expect(updateManyStub.called).to.be.true;
    const setArg = updateManyStub.firstCall.args[1];
    expect(setArg.$set.mag).to.equal("LYON");
    expect(setArg.$set.dateLivraisonSouhaitee).to.be.undefined;
  });

  it("compte introuvable quand Gamesys ne renvoie ni date ni ville/magasin, sans écrire", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 999999, client: "LM" }]);
    fetchDossierLivraisonDatesStub.resolves({
      dateDepartUsine: null,
      dateLivraisonSouhaitee: null,
      magasin: null,
      ville: null,
    });

    const resume = await backfillDecoLivraisonDates({ dryRun: false });

    expect(resume.introuvables).to.equal(1);
    expect(resume.misAJour).to.equal(0);
    expect(updateManyStub.called).to.be.false;
  });

  it("compte erreur et continue si un numCmd échoue", async () => {
    mockPendingDocs([
      { _id: "a", numCmd: 1, client: "LM" },
      { _id: "b", numCmd: 2, client: "LM" },
    ]);
    fetchDossierLivraisonDatesStub.withArgs(fakeConnection, 1).rejects(new Error("ODBC timeout"));
    fetchDossierLivraisonDatesStub.withArgs(fakeConnection, 2).resolves({
      dateDepartUsine: new Date("2025-01-01"),
      dateLivraisonSouhaitee: new Date("2025-01-15"),
      magasin: null,
      ville: "TOULOUSE",
    });
    updateManyStub.resolves({ modifiedCount: 1 });

    const resume = await backfillDecoLivraisonDates({ dryRun: false });

    expect(resume.erreurs).to.equal(1);
    expect(resume.misAJour).to.equal(1);
  });

  it("ferme la connexion même si un numCmd échoue", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 1, client: "LM" }]);
    fetchDossierLivraisonDatesStub.rejects(new Error("boom"));

    await backfillDecoLivraisonDates({ dryRun: false });

    expect(fakeConnection.close.calledOnce).to.be.true;
  });

  it("applique dateLivraisonSouhaitee/mag depuis la synthèse sans appeler fetchDossierLivraisonDates", async () => {
    mockPendingDocs([{ numCmd: 10, client: "LM" }]);
    // Le client qui décide `mag` vient de doc.client, pas de l'entrée Map.
    const synthese = new Map([
      [10, { dateLivraisonSouhaitee: new Date("2026-09-23"), magasin: "M", ville: "V" }],
    ]);
    updateManyStub.resolves({ modifiedCount: 1 });

    const resume = await backfillDecoLivraisonDates({ sinceDate: new Date(), synthese });

    expect(fetchDossierLivraisonDatesStub.called).to.be.false;
    expect(resume.misAJour).to.equal(1);
    // mag = ville pour LM
    expect(updateManyStub.firstCall.args[1].$set).to.include({ mag: "V" });
  });

  it("synthèse ECOM : mag = magasin (destinataire) en priorité, jamais le repli fc_references", async () => {
    mockPendingDocs([{ numCmd: 11, client: "ECOM" }]);
    const synthese = new Map([
      [
        11,
        {
          dateLivraisonSouhaitee: new Date("2026-09-23"),
          magasin: "END CUSTOMER",
          ville: "CITY",
          villeRef: "REFCITY",
          magasinRef: "Commande E-commerce CB",
        },
      ],
    ]);
    updateManyStub.resolves({ modifiedCount: 1 });

    await backfillDecoLivraisonDates({ sinceDate: new Date(), synthese });

    expect(fetchDossierLivraisonDatesStub.called).to.be.false;
    expect(updateManyStub.firstCall.args[1].$set.mag).to.equal("END CUSTOMER");
  });

  it("retombe sur fetchDossierLivraisonDates quand le numCmd est absent de la synthèse", async () => {
    mockPendingDocs([{ numCmd: 99, client: "LM" }]);
    const synthese = new Map();
    fetchDossierLivraisonDatesStub.resolves({
      dateLivraisonSouhaitee: new Date("2026-09-01"),
      ville: "W",
    });
    updateManyStub.resolves({ modifiedCount: 1 });

    await backfillDecoLivraisonDates({ sinceDate: new Date(), synthese });

    expect(fetchDossierLivraisonDatesStub.calledOnce).to.be.true;
  });
});
