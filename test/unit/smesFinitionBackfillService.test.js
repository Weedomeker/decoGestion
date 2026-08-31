const { expect } = require("chai");
const sinon = require("sinon");

const dossierService = require("../../server/src/gamesys/services/dossierService");
const dbConfig = require("../../server/src/gamesys/config/db");
const Deco = require("../../server/src/models/Deco");
const { backfillSmesFinition } = require("../../server/src/services/smesFinitionBackfillService");

describe("smesFinitionBackfillService.backfillSmesFinition()", () => {
  let findStub;
  let updateOneStub;
  let getDbConnectionStub;
  let fetchVernisStub;
  let fakeConnection;

  beforeEach(() => {
    fakeConnection = { close: sinon.stub().resolves() };
    findStub = sinon.stub(Deco, "find").returns({ lean: sinon.stub().resolves([]) });
    updateOneStub = sinon.stub(Deco, "updateOne").resolves({ modifiedCount: 1 });
    getDbConnectionStub = sinon.stub(dbConfig, "getDbConnection").resolves(fakeConnection);
    fetchVernisStub = sinon.stub(dossierService, "fetchDossierVernis");
  });

  afterEach(() => sinon.restore());

  const mockDocs = (docs) => findStub.returns({ lean: sinon.stub().resolves(docs) });

  it("ne cible que les documents surMesure:true et ajoute createdAt quand sinceDate est fourni", async () => {
    const sinceDate = new Date("2025-01-01T00:00:00.000Z");
    await backfillSmesFinition({ sinceDate });
    expect(findStub.firstCall.args[0]).to.deep.equal({ surMesure: true, createdAt: { $gte: sinceDate } });
  });

  it("remplace la texture du gabarit par le vernis Mat/Brillant", async () => {
    mockDocs([{ _id: "a", numCmd: 167431, sousDossier: "03", finition: "LISSE" }]);
    fetchVernisStub.resolves("Mat");

    const resume = await backfillSmesFinition({});

    expect(fetchVernisStub.calledOnceWith(fakeConnection, 167431, "03")).to.be.true;
    expect(updateOneStub.calledOnceWithExactly({ _id: "a" }, { $set: { finition: "Mat" } })).to.be.true;
    expect(resume.misAJour).to.equal(1);
  });

  it("normalise une casse historique incohérente ('mat' -> 'Mat')", async () => {
    mockDocs([{ _id: "b", numCmd: 1, sousDossier: "00", finition: "mat" }]);
    fetchVernisStub.resolves("Mat");

    const resume = await backfillSmesFinition({});

    expect(updateOneStub.calledOnce).to.be.true;
    expect(resume.misAJour).to.equal(1);
  });

  it("laisse tel quel un document déjà correct", async () => {
    mockDocs([{ _id: "c", numCmd: 1, sousDossier: "00", finition: "Brillant" }]);
    fetchVernisStub.resolves("Brillant");

    const resume = await backfillSmesFinition({});

    expect(updateOneStub.called).to.be.false;
    expect(resume.inchanges).to.equal(1);
  });

  it("compte introuvable quand Gamesys ne renvoie aucun vernis, sans écrire", async () => {
    mockDocs([{ _id: "d", numCmd: 1, sousDossier: "00", finition: "COULEUR" }]);
    fetchVernisStub.resolves(null);

    const resume = await backfillSmesFinition({});

    expect(updateOneStub.called).to.be.false;
    expect(resume.introuvables).to.equal(1);
  });

  it("en dry-run, compte les mises à jour sans écrire", async () => {
    mockDocs([{ _id: "e", numCmd: 1, sousDossier: "00", finition: "LISSE" }]);
    fetchVernisStub.resolves("Mat");

    const resume = await backfillSmesFinition({ dryRun: true });

    expect(getDbConnectionStub.called).to.be.true;
    expect(updateOneStub.called).to.be.false;
    expect(resume.misAJour).to.equal(1);
  });

  it("ferme la connexion et poursuit malgré une erreur sur un document", async () => {
    mockDocs([
      { _id: "x", numCmd: 1, sousDossier: "00", finition: "LISSE" },
      { _id: "y", numCmd: 2, sousDossier: "00", finition: "LISSE" },
    ]);
    fetchVernisStub.onFirstCall().rejects(new Error("ODBC timeout"));
    fetchVernisStub.onSecondCall().resolves("Brillant");

    const resume = await backfillSmesFinition({});

    expect(resume.erreurs).to.equal(1);
    expect(resume.misAJour).to.equal(1);
    expect(fakeConnection.close.calledOnce).to.be.true;
  });
});
