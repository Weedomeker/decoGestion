const { expect } = require("chai");
const sinon = require("sinon");

const dossierService = require("../../server/src/gamesys/services/dossierService");
const dbConfig = require("../../server/src/gamesys/config/db");
const Deco = require("../../server/src/models/Deco");
const { backfillDecoPrix } = require("../../server/src/services/decoPrixBackfillService");

describe("decoPrixBackfillService.backfillDecoPrix()", () => {
  let findStub;
  let updateManyStub;
  let getDbConnectionStub;
  let fetchDossierPrixTotalStub;
  let fakeConnection;

  beforeEach(() => {
    fakeConnection = { close: sinon.stub().resolves() };
    findStub = sinon.stub(Deco, "find").returns({ lean: sinon.stub() });
    updateManyStub = sinon.stub(Deco, "updateMany").resolves({ modifiedCount: 0 });
    getDbConnectionStub = sinon.stub(dbConfig, "getDbConnection").resolves(fakeConnection);
    fetchDossierPrixTotalStub = sinon.stub(dossierService, "fetchDossierPrixTotal");
  });

  afterEach(() => {
    sinon.restore();
  });

  function mockPendingDocs(docs) {
    findStub.returns({ lean: sinon.stub().resolves(docs) });
  }

  it("interroge Deco sur les documents avec numCmd>0 sans prixTotal", async () => {
    mockPendingDocs([]);

    await backfillDecoPrix({ dryRun: false });

    expect(findStub.calledOnce).to.be.true;
    expect(findStub.firstCall.args[0]).to.deep.equal({
      numCmd: { $gt: 0 },
      prixTotal: { $exists: false },
    });
  });

  it("ajoute createdAt au filtre quand sinceDate est fourni", async () => {
    mockPendingDocs([]);
    const sinceDate = new Date("2026-08-18T00:00:00.000Z");

    await backfillDecoPrix({ dryRun: false, sinceDate });

    expect(findStub.firstCall.args[0]).to.deep.equal({
      numCmd: { $gt: 0 },
      prixTotal: { $exists: false },
      createdAt: { $gte: sinceDate },
    });
  });

  it("ne modifie rien en dry-run", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 100473 }]);

    const resume = await backfillDecoPrix({ dryRun: true });

    expect(resume.candidats).to.equal(1);
    expect(getDbConnectionStub.called).to.be.false;
    expect(updateManyStub.called).to.be.false;
  });

  it("déduplique par numCmd : un seul appel Gamesys pour plusieurs documents partageant le même numCmd", async () => {
    mockPendingDocs([
      { _id: "a", numCmd: 165675 },
      { _id: "b", numCmd: 165675 },
    ]);
    fetchDossierPrixTotalStub.withArgs(fakeConnection, 165675).resolves(199.9);
    updateManyStub.resolves({ modifiedCount: 2 });

    const resume = await backfillDecoPrix({ dryRun: false });

    expect(fetchDossierPrixTotalStub.callCount).to.equal(1);
    expect(
      updateManyStub.calledWith(
        { numCmd: 165675, prixTotal: { $exists: false } },
        { $set: { prixTotal: 199.9 } },
      ),
    ).to.be.true;
    expect(resume.misAJour).to.equal(2);
    expect(fakeConnection.close.calledOnce).to.be.true;
  });

  it("compte introuvable quand Gamesys ne renvoie aucun prix, sans écrire", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 999999 }]);
    fetchDossierPrixTotalStub.resolves(null);

    const resume = await backfillDecoPrix({ dryRun: false });

    expect(resume.introuvables).to.equal(1);
    expect(resume.misAJour).to.equal(0);
    expect(updateManyStub.called).to.be.false;
  });

  it("traite un prix de 0 comme trouvé (écrit en base)", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 1 }]);
    fetchDossierPrixTotalStub.resolves(0);
    updateManyStub.resolves({ modifiedCount: 1 });

    const resume = await backfillDecoPrix({ dryRun: false });

    expect(resume.introuvables).to.equal(0);
    expect(resume.misAJour).to.equal(1);
    expect(updateManyStub.calledWith({ numCmd: 1, prixTotal: { $exists: false } }, { $set: { prixTotal: 0 } })).to.be
      .true;
  });

  it("compte erreur et continue si un numCmd échoue", async () => {
    mockPendingDocs([
      { _id: "a", numCmd: 1 },
      { _id: "b", numCmd: 2 },
    ]);
    fetchDossierPrixTotalStub.withArgs(fakeConnection, 1).rejects(new Error("ODBC timeout"));
    fetchDossierPrixTotalStub.withArgs(fakeConnection, 2).resolves(42);
    updateManyStub.resolves({ modifiedCount: 1 });

    const resume = await backfillDecoPrix({ dryRun: false });

    expect(resume.erreurs).to.equal(1);
    expect(resume.misAJour).to.equal(1);
  });

  it("ferme la connexion même si un numCmd échoue", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 1 }]);
    fetchDossierPrixTotalStub.rejects(new Error("boom"));

    await backfillDecoPrix({ dryRun: false });

    expect(fakeConnection.close.calledOnce).to.be.true;
  });

  it("applique prixTotal depuis la synthèse sans appeler fetchDossierPrixTotal", async () => {
    mockPendingDocs([{ numCmd: 10 }]);
    const synthese = new Map([[10, { prixTotal: 488.73 }]]);
    updateManyStub.resolves({ modifiedCount: 2 });

    const resume = await backfillDecoPrix({ sinceDate: new Date(), synthese });

    expect(fetchDossierPrixTotalStub.called).to.be.false;
    expect(resume.misAJour).to.equal(2);
  });

  it("retombe sur fetchDossierPrixTotal si numCmd absent de la synthèse", async () => {
    mockPendingDocs([{ numCmd: 99 }]);
    fetchDossierPrixTotalStub.resolves(12.5);
    updateManyStub.resolves({ modifiedCount: 1 });

    await backfillDecoPrix({ sinceDate: new Date(), synthese: new Map() });

    expect(fetchDossierPrixTotalStub.calledOnce).to.be.true;
  });

  it("compte introuvable quand la synthèse a le numCmd mais prixTotal null", async () => {
    mockPendingDocs([{ numCmd: 10 }]);

    const resume = await backfillDecoPrix({
      sinceDate: new Date(),
      synthese: new Map([[10, { prixTotal: null }]]),
    });

    expect(resume.introuvables).to.equal(1);
    expect(fetchDossierPrixTotalStub.called).to.be.false;
  });
});
