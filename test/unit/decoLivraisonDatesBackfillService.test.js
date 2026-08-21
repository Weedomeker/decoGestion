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

  it("interroge Deco sur les documents avec numCmd>0 sans dateLivraisonSouhaitee", async () => {
    mockPendingDocs([]);

    await backfillDecoLivraisonDates({ dryRun: false });

    expect(findStub.calledOnce).to.be.true;
    expect(findStub.firstCall.args[0]).to.deep.equal({
      numCmd: { $gt: 0 },
      dateLivraisonSouhaitee: { $exists: false },
    });
  });

  it("ajoute createdAt au filtre quand sinceDate est fourni", async () => {
    mockPendingDocs([]);
    const sinceDate = new Date("2026-08-18T00:00:00.000Z");

    await backfillDecoLivraisonDates({ dryRun: false, sinceDate });

    expect(findStub.firstCall.args[0]).to.deep.equal({
      numCmd: { $gt: 0 },
      dateLivraisonSouhaitee: { $exists: false },
      createdAt: { $gte: sinceDate },
    });
  });

  it("ne modifie rien en dry-run", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 100473 }]);

    const resume = await backfillDecoLivraisonDates({ dryRun: true });

    expect(resume.candidats).to.equal(1);
    expect(getDbConnectionStub.called).to.be.false;
    expect(updateManyStub.called).to.be.false;
  });

  it("déduplique par numCmd : un seul appel Gamesys pour plusieurs documents partageant le même numCmd", async () => {
    mockPendingDocs([
      { _id: "a", numCmd: 165675 },
      { _id: "b", numCmd: 165675 },
    ]);
    fetchDossierLivraisonDatesStub
      .withArgs(fakeConnection, 165675)
      .resolves({ dateDepartUsine: new Date("2025-02-20"), dateLivraisonSouhaitee: new Date("2025-03-01") });
    updateManyStub.resolves({ modifiedCount: 2 });

    const resume = await backfillDecoLivraisonDates({ dryRun: false });

    expect(fetchDossierLivraisonDatesStub.callCount).to.equal(1);
    expect(
      updateManyStub.calledWith(
        { numCmd: 165675, dateLivraisonSouhaitee: { $exists: false } },
        { $set: { dateLivraisonSouhaitee: new Date("2025-03-01") } },
      ),
    ).to.be.true;
    expect(resume.misAJour).to.equal(2);
    expect(fakeConnection.close.calledOnce).to.be.true;
  });

  it("compte introuvable quand Gamesys ne renvoie aucune date, sans écrire", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 999999 }]);
    fetchDossierLivraisonDatesStub.resolves({ dateDepartUsine: null, dateLivraisonSouhaitee: null });

    const resume = await backfillDecoLivraisonDates({ dryRun: false });

    expect(resume.introuvables).to.equal(1);
    expect(resume.misAJour).to.equal(0);
    expect(updateManyStub.called).to.be.false;
  });

  it("compte erreur et continue si un numCmd échoue", async () => {
    mockPendingDocs([
      { _id: "a", numCmd: 1 },
      { _id: "b", numCmd: 2 },
    ]);
    fetchDossierLivraisonDatesStub.withArgs(fakeConnection, 1).rejects(new Error("ODBC timeout"));
    fetchDossierLivraisonDatesStub
      .withArgs(fakeConnection, 2)
      .resolves({ dateDepartUsine: new Date("2025-01-01"), dateLivraisonSouhaitee: new Date("2025-01-15") });
    updateManyStub.resolves({ modifiedCount: 1 });

    const resume = await backfillDecoLivraisonDates({ dryRun: false });

    expect(resume.erreurs).to.equal(1);
    expect(resume.misAJour).to.equal(1);
  });

  it("ferme la connexion même si un numCmd échoue", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 1 }]);
    fetchDossierLivraisonDatesStub.rejects(new Error("boom"));

    await backfillDecoLivraisonDates({ dryRun: false });

    expect(fakeConnection.close.calledOnce).to.be.true;
  });
});
