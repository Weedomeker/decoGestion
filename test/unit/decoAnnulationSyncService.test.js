const { expect } = require("chai");
const sinon = require("sinon");

const dossierService = require("../../server/src/gamesys/services/dossierService");
const dbConfig = require("../../server/src/gamesys/config/db");
const Deco = require("../../server/src/models/Deco");
const { syncAnnulationsDepuisGamesys } = require("../../server/src/services/decoAnnulationSyncService");

describe("decoAnnulationSyncService.syncAnnulationsDepuisGamesys()", () => {
  let findStub;
  let leanStub;
  let checkAnnulationsStub;
  let checkAnnulationsParCommandeStub;
  let updateOneStub;
  let getDbConnectionStub;
  let fakeConnection;

  beforeEach(() => {
    fakeConnection = { close: sinon.stub().resolves() };
    leanStub = sinon.stub();
    findStub = sinon.stub(Deco, "find").returns({ lean: leanStub });
    checkAnnulationsStub = sinon.stub(dossierService, "checkAnnulations");
    checkAnnulationsParCommandeStub = sinon.stub(dossierService, "checkAnnulationsParCommande").resolves([]);
    updateOneStub = sinon.stub(Deco, "updateOne").resolves();
    getDbConnectionStub = sinon.stub(dbConfig, "getDbConnection").resolves(fakeConnection);
  });

  afterEach(() => sinon.restore());

  it("ne touche pas Gamesys quand aucun stub n'est en \"A lancer\"", async () => {
    leanStub.resolves([]);

    const resume = await syncAnnulationsDepuisGamesys();

    expect(resume).to.deep.equal({ candidats: 0, annules: 0, erreurs: 0 });
    expect(findStub.calledOnceWith({ gamesysStub: true, status: "A lancer" })).to.be.true;
    expect(checkAnnulationsStub.called).to.be.false;
  });

  it("bascule en \"annule\" un stub dont le sous-dossier est annulé côté Gamesys", async () => {
    leanStub.resolves([{ _id: "id1", numCmd: 168217, sousDossier: "00", pkOnly: false }]);
    checkAnnulationsStub.resolves(["168217/00"]);

    const resume = await syncAnnulationsDepuisGamesys();

    expect(resume).to.deep.equal({ candidats: 1, annules: 1, erreurs: 0 });
    expect(checkAnnulationsStub.calledOnceWith(fakeConnection, ["168217/00"])).to.be.true;
    expect(updateOneStub.calledOnceWith({ _id: "id1" }, { $set: { status: "annule" } })).to.be.true;
  });

  it("ne touche pas un stub dont le sous-dossier n'est pas annulé côté Gamesys", async () => {
    leanStub.resolves([{ _id: "id1", numCmd: 168056, sousDossier: "00", pkOnly: false }]);
    checkAnnulationsStub.resolves([]);

    const resume = await syncAnnulationsDepuisGamesys();

    expect(resume).to.deep.equal({ candidats: 1, annules: 0, erreurs: 0 });
    expect(updateOneStub.called).to.be.false;
  });

  it("bascule un stub pkOnly seulement si TOUS ses sous-dossiers sont annulés", async () => {
    leanStub.resolves([{ _id: "idPk", numCmd: 168051, sousDossiers: ["01", "02"], pkOnly: true }]);
    checkAnnulationsStub.resolves(["168051/01", "168051/02"]);

    const resume = await syncAnnulationsDepuisGamesys();

    expect(resume).to.deep.equal({ candidats: 1, annules: 1, erreurs: 0 });
    expect(updateOneStub.calledOnceWith({ _id: "idPk" }, { $set: { status: "annule" } })).to.be.true;
  });

  it("ne bascule pas un stub pkOnly partiellement annulé (annulation incomplète)", async () => {
    leanStub.resolves([{ _id: "idPk", numCmd: 168051, sousDossiers: ["01", "02"], pkOnly: true }]);
    checkAnnulationsStub.resolves(["168051/01"]);

    const resume = await syncAnnulationsDepuisGamesys();

    expect(resume).to.deep.equal({ candidats: 1, annules: 0, erreurs: 0 });
    expect(updateOneStub.called).to.be.false;
  });

  it("vérifie au niveau commande un stub pkOnly sans sousDossiers et le bascule si tout est annulé", async () => {
    leanStub.resolves([{ _id: "idPk", numCmd: 168051, pkOnly: true }]);
    checkAnnulationsStub.resolves([]);
    checkAnnulationsParCommandeStub.resolves([168051]);

    const resume = await syncAnnulationsDepuisGamesys();

    expect(resume).to.deep.equal({ candidats: 1, annules: 1, erreurs: 0 });
    expect(checkAnnulationsParCommandeStub.calledOnceWith(fakeConnection, [168051])).to.be.true;
    expect(updateOneStub.calledOnceWith({ _id: "idPk" }, { $set: { status: "annule" } })).to.be.true;
  });

  it("ne bascule pas un stub pkOnly sans sousDossiers dont la commande n'est pas entièrement annulée", async () => {
    leanStub.resolves([{ _id: "idPk", numCmd: 168051, sousDossiers: [], pkOnly: true }]);
    checkAnnulationsStub.resolves([]);
    checkAnnulationsParCommandeStub.resolves([]);

    const resume = await syncAnnulationsDepuisGamesys();

    expect(resume).to.deep.equal({ candidats: 1, annules: 0, erreurs: 0 });
    expect(checkAnnulationsParCommandeStub.calledOnceWith(fakeConnection, [168051])).to.be.true;
    expect(updateOneStub.called).to.be.false;
  });

  it("n'interroge pas Gamesys au niveau commande pour les stubs pkOnly qui ont des sousDossiers", async () => {
    leanStub.resolves([{ _id: "idPk", numCmd: 168051, sousDossiers: ["01"], pkOnly: true }]);
    checkAnnulationsStub.resolves([]);

    await syncAnnulationsDepuisGamesys();

    expect(checkAnnulationsParCommandeStub.called).to.be.false;
  });

  it("compte le candidat en erreur et ne plante pas quand checkAnnulations échoue", async () => {
    leanStub.resolves([{ _id: "id1", numCmd: 168217, sousDossier: "00", pkOnly: false }]);
    checkAnnulationsStub.rejects(new Error("ODBC indisponible"));

    const resume = await syncAnnulationsDepuisGamesys();

    expect(resume).to.deep.equal({ candidats: 1, annules: 0, erreurs: 1 });
    expect(updateOneStub.called).to.be.false;
  });

  it("en mode dry-run, compte les stubs annulables sans écrire en base", async () => {
    leanStub.resolves([{ _id: "id1", numCmd: 168217, sousDossier: "00", pkOnly: false }]);
    checkAnnulationsStub.resolves(["168217/00"]);

    const resume = await syncAnnulationsDepuisGamesys({ dryRun: true });

    expect(resume).to.deep.equal({ candidats: 1, annules: 1, erreurs: 0 });
    expect(updateOneStub.called).to.be.false;
  });

  it("ferme la connexion Gamesys même en cas d'échec", async () => {
    leanStub.resolves([{ _id: "id1", numCmd: 168217, sousDossier: "00", pkOnly: false }]);
    checkAnnulationsStub.rejects(new Error("ODBC indisponible"));

    await syncAnnulationsDepuisGamesys();

    expect(fakeConnection.close.calledOnce).to.be.true;
  });
});
