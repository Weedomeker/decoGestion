const { expect } = require("chai");
const sinon = require("sinon");

const dossierService = require("../../server/src/gamesys/services/dossierService");
const dbConfig = require("../../server/src/gamesys/config/db");
const ConsommationCommande = require("../../server/src/models/ConsommationCommande");
const { backfillLivraisonDates } = require("../../server/src/services/livraisonDatesBackfillService");

describe("livraisonDatesBackfillService.backfillLivraisonDates()", () => {
  let findStub;
  let updateOneStub;
  let getDbConnectionStub;
  let fetchDossierLivraisonDatesStub;
  let fakeConnection;

  beforeEach(() => {
    fakeConnection = { close: sinon.stub().resolves() };
    findStub = sinon.stub(ConsommationCommande, "find").returns({ lean: sinon.stub() });
    updateOneStub = sinon.stub(ConsommationCommande, "updateOne").resolves({});
    getDbConnectionStub = sinon.stub(dbConfig, "getDbConnection").resolves(fakeConnection);
    fetchDossierLivraisonDatesStub = sinon.stub(dossierService, "fetchDossierLivraisonDates");
  });

  afterEach(() => {
    sinon.restore();
  });

  function mockPendingDocs(docs) {
    findStub.returns({ lean: sinon.stub().resolves(docs) });
  }

  it("interroge ConsommationCommande sur les documents sans dateDepartUsine ou dateLivraisonSouhaitee", async () => {
    mockPendingDocs([]);

    await backfillLivraisonDates({ dryRun: false });

    expect(findStub.calledOnce).to.be.true;
    expect(findStub.firstCall.args[0]).to.deep.equal({
      $or: [{ dateDepartUsine: { $exists: false } }, { dateLivraisonSouhaitee: { $exists: false } }],
    });
  });

  it("ne modifie rien en dry-run", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 100473 }]);

    const resume = await backfillLivraisonDates({ dryRun: true });

    expect(resume.candidats).to.equal(1);
    expect(getDbConnectionStub.called).to.be.false;
    expect(updateOneStub.called).to.be.false;
  });

  it("met à jour les deux dates pour chaque document trouvé dans Gamesys", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 100473 }, { _id: "b", numCmd: 100504 }]);
    fetchDossierLivraisonDatesStub
      .withArgs(fakeConnection, 100473)
      .resolves({ dateDepartUsine: new Date("2025-02-20"), dateLivraisonSouhaitee: new Date("2025-03-01") });
    fetchDossierLivraisonDatesStub
      .withArgs(fakeConnection, 100504)
      .resolves({ dateDepartUsine: new Date("2025-02-19"), dateLivraisonSouhaitee: null });

    const resume = await backfillLivraisonDates({ dryRun: false });

    expect(resume.misAJour).to.equal(2);
    expect(resume.introuvables).to.equal(0);
    expect(resume.erreurs).to.equal(0);
    expect(updateOneStub.calledTwice).to.be.true;
    expect(
      updateOneStub.calledWith(
        { _id: "a" },
        { $set: { dateDepartUsine: new Date("2025-02-20"), dateLivraisonSouhaitee: new Date("2025-03-01") } },
      ),
    ).to.be.true;
    expect(updateOneStub.calledWith({ _id: "b" }, { $set: { dateDepartUsine: new Date("2025-02-19") } })).to.be.true;
    expect(fakeConnection.close.calledOnce).to.be.true;
  });

  it("compte introuvable quand Gamesys ne renvoie aucune date, sans écrire", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 999999 }]);
    fetchDossierLivraisonDatesStub.resolves({ dateDepartUsine: null, dateLivraisonSouhaitee: null });

    const resume = await backfillLivraisonDates({ dryRun: false });

    expect(resume.introuvables).to.equal(1);
    expect(resume.misAJour).to.equal(0);
    expect(updateOneStub.called).to.be.false;
  });

  it("compte erreur et continue si un document échoue", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 1 }, { _id: "b", numCmd: 2 }]);
    fetchDossierLivraisonDatesStub.withArgs(fakeConnection, 1).rejects(new Error("ODBC timeout"));
    fetchDossierLivraisonDatesStub
      .withArgs(fakeConnection, 2)
      .resolves({ dateDepartUsine: new Date("2025-01-01"), dateLivraisonSouhaitee: new Date("2025-01-15") });

    const resume = await backfillLivraisonDates({ dryRun: false });

    expect(resume.erreurs).to.equal(1);
    expect(resume.misAJour).to.equal(1);
  });

  it("ferme la connexion même si un document échoue", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 1 }]);
    fetchDossierLivraisonDatesStub.rejects(new Error("boom"));

    await backfillLivraisonDates({ dryRun: false });

    expect(fakeConnection.close.calledOnce).to.be.true;
  });
});
