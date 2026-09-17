const { expect } = require("chai");
const sinon = require("sinon");

const dossierService = require("../../server/src/gamesys/services/dossierService");
const dbConfig = require("../../server/src/gamesys/config/db");
const Deco = require("../../server/src/models/Deco");
const { backfillDecoCommandeInfo } = require("../../server/src/services/decoCommandeInfoBackfillService");

describe("decoCommandeInfoBackfillService.backfillDecoCommandeInfo()", () => {
  let findStub;
  let updateManyStub;
  let getDbConnectionStub;
  let fetchCommandeInfoStub;
  let fetchFormatPlaqueStub;
  let fakeConnection;

  beforeEach(() => {
    fakeConnection = { close: sinon.stub().resolves() };
    findStub = sinon.stub(Deco, "find").returns({ lean: sinon.stub() });
    updateManyStub = sinon.stub(Deco, "updateMany").resolves({ modifiedCount: 0 });
    getDbConnectionStub = sinon.stub(dbConfig, "getDbConnection").resolves(fakeConnection);
    fetchCommandeInfoStub = sinon.stub(dossierService, "fetchDossierCommandeInfo");
    fetchFormatPlaqueStub = sinon.stub(dossierService, "fetchDossierFormatPlaque").resolves(null);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mockPendingDocs(docs) {
    findStub.returns({ lean: sinon.stub().resolves(docs) });
  }

  it("interroge Deco sur les documents avec numCmd>0 sans dateCommande", async () => {
    mockPendingDocs([]);

    await backfillDecoCommandeInfo({ dryRun: false });

    expect(findStub.calledOnce).to.be.true;
    expect(findStub.firstCall.args[0]).to.deep.equal({
      numCmd: { $gt: 0 },
      dateCommande: { $exists: false },
    });
  });

  it("ajoute createdAt au filtre quand sinceDate est fourni", async () => {
    mockPendingDocs([]);
    const sinceDate = new Date("2026-08-18T00:00:00.000Z");

    await backfillDecoCommandeInfo({ dryRun: false, sinceDate });

    expect(findStub.firstCall.args[0]).to.deep.equal({
      numCmd: { $gt: 0 },
      dateCommande: { $exists: false },
      createdAt: { $gte: sinceDate },
    });
  });

  it("ne modifie rien en dry-run", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 167648 }]);

    const resume = await backfillDecoCommandeInfo({ dryRun: true });

    expect(resume.candidats).to.equal(1);
    expect(getDbConnectionStub.called).to.be.false;
    expect(updateManyStub.called).to.be.false;
  });

  it("déduplique par numCmd : un seul appel Gamesys pour plusieurs documents partageant le même numCmd", async () => {
    mockPendingDocs([
      { _id: "a", numCmd: 167648 },
      { _id: "b", numCmd: 167648 },
    ]);
    const commandeInfo = {
      dateCommande: new Date("2026-08-20"),
      codeClient: "LM019",
      refClient: "82329874 - FASSOT",
      nombreProfil: 6,
      nombreKitPose: 5,
    };
    fetchCommandeInfoStub.withArgs(fakeConnection, 167648).resolves(commandeInfo);
    fetchFormatPlaqueStub.withArgs(fakeConnection, 167648).resolves("1510 x 2600");
    updateManyStub.resolves({ modifiedCount: 2 });

    const resume = await backfillDecoCommandeInfo({ dryRun: false });

    expect(fetchCommandeInfoStub.callCount).to.equal(1);
    expect(
      updateManyStub.calledWith(
        { numCmd: 167648, dateCommande: { $exists: false } },
        { $set: { ...commandeInfo, formatPlaqueGamesys: "1510 x 2600" } },
      ),
    ).to.be.true;
    expect(resume.misAJour).to.equal(2);
    expect(fakeConnection.close.calledOnce).to.be.true;
  });

  it("compte introuvable quand Gamesys ne renvoie aucune info de commande, sans écrire", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 999999 }]);
    fetchCommandeInfoStub.resolves(null);

    const resume = await backfillDecoCommandeInfo({ dryRun: false });

    expect(resume.introuvables).to.equal(1);
    expect(resume.misAJour).to.equal(0);
    expect(updateManyStub.called).to.be.false;
    expect(fetchFormatPlaqueStub.called).to.be.false;
  });

  it("compte erreur et continue si un numCmd échoue", async () => {
    mockPendingDocs([
      { _id: "a", numCmd: 1 },
      { _id: "b", numCmd: 2 },
    ]);
    fetchCommandeInfoStub.withArgs(fakeConnection, 1).rejects(new Error("ODBC timeout"));
    fetchCommandeInfoStub.withArgs(fakeConnection, 2).resolves({
      dateCommande: new Date("2026-01-01"),
      codeClient: "LM01",
      refClient: "REF",
      nombreProfil: 0,
      nombreKitPose: 0,
    });
    updateManyStub.resolves({ modifiedCount: 1 });

    const resume = await backfillDecoCommandeInfo({ dryRun: false });

    expect(resume.erreurs).to.equal(1);
    expect(resume.misAJour).to.equal(1);
  });

  it("ferme la connexion même si un numCmd échoue", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 1 }]);
    fetchCommandeInfoStub.rejects(new Error("boom"));

    await backfillDecoCommandeInfo({ dryRun: false });

    expect(fakeConnection.close.calledOnce).to.be.true;
  });
});
