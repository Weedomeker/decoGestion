const { expect } = require("chai");
const sinon = require("sinon");

const dossierService = require("../../server/src/gamesys/services/dossierService");
const dbConfig = require("../../server/src/gamesys/config/db");
const ConsommationCommande = require("../../server/src/models/ConsommationCommande");
const { backfillDateCommande } = require("../../server/src/services/dateCommandeBackfillService");

describe("dateCommandeBackfillService.backfillDateCommande()", () => {
  let findStub;
  let updateOneStub;
  let getDbConnectionStub;
  let fetchDossierDateStub;
  let fakeConnection;

  beforeEach(() => {
    fakeConnection = { close: sinon.stub().resolves() };
    findStub = sinon.stub(ConsommationCommande, "find").returns({ lean: sinon.stub() });
    updateOneStub = sinon.stub(ConsommationCommande, "updateOne").resolves({});
    getDbConnectionStub = sinon.stub(dbConfig, "getDbConnection").resolves(fakeConnection);
    fetchDossierDateStub = sinon.stub(dossierService, "fetchDossierDate");
  });

  afterEach(() => {
    sinon.restore();
  });

  function mockPendingDocs(docs) {
    findStub.returns({ lean: sinon.stub().resolves(docs) });
  }

  it("interroge ConsommationCommande sur les documents sans dateCommande", async () => {
    mockPendingDocs([]);

    await backfillDateCommande({ dryRun: false });

    expect(findStub.calledOnce).to.be.true;
    expect(findStub.firstCall.args[0]).to.deep.equal({ dateCommande: { $exists: false } });
  });

  it("ne modifie rien en dry-run", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 100473 }]);

    const resume = await backfillDateCommande({ dryRun: true });

    expect(resume.candidats).to.equal(1);
    expect(getDbConnectionStub.called).to.be.false;
    expect(updateOneStub.called).to.be.false;
  });

  it("met à jour dateCommande pour chaque document trouvé dans Gamesys", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 100473 }, { _id: "b", numCmd: 100504 }]);
    fetchDossierDateStub.withArgs(fakeConnection, 100473).resolves(new Date("2024-12-04"));
    fetchDossierDateStub.withArgs(fakeConnection, 100504).resolves(new Date("2025-02-19"));

    const resume = await backfillDateCommande({ dryRun: false });

    expect(resume.misAJour).to.equal(2);
    expect(resume.introuvables).to.equal(0);
    expect(resume.erreurs).to.equal(0);
    expect(updateOneStub.calledTwice).to.be.true;
    expect(updateOneStub.calledWith({ _id: "a" }, { $set: { dateCommande: new Date("2024-12-04") } })).to.be.true;
    expect(fakeConnection.close.calledOnce).to.be.true;
  });

  it("compte introuvable quand Gamesys ne renvoie aucune date, sans écrire", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 999999 }]);
    fetchDossierDateStub.resolves(null);

    const resume = await backfillDateCommande({ dryRun: false });

    expect(resume.introuvables).to.equal(1);
    expect(resume.misAJour).to.equal(0);
    expect(updateOneStub.called).to.be.false;
  });

  it("compte erreur et continue si un document échoue", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 1 }, { _id: "b", numCmd: 2 }]);
    fetchDossierDateStub.withArgs(fakeConnection, 1).rejects(new Error("ODBC timeout"));
    fetchDossierDateStub.withArgs(fakeConnection, 2).resolves(new Date("2025-01-01"));

    const resume = await backfillDateCommande({ dryRun: false });

    expect(resume.erreurs).to.equal(1);
    expect(resume.misAJour).to.equal(1);
  });

  it("ferme la connexion même si un document échoue", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 1 }]);
    fetchDossierDateStub.rejects(new Error("boom"));

    await backfillDateCommande({ dryRun: false });

    expect(fakeConnection.close.calledOnce).to.be.true;
  });
});
