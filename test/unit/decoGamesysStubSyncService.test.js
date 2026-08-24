const { expect } = require("chai");
const sinon = require("sinon");

const dossierService = require("../../server/src/gamesys/services/dossierService");
const dbConfig = require("../../server/src/gamesys/config/db");
const Deco = require("../../server/src/models/Deco");
const { syncDecoStubsDepuisGamesys } = require("../../server/src/services/decoGamesysStubSyncService");

describe("decoGamesysStubSyncService.syncDecoStubsDepuisGamesys()", () => {
  let listCandidatsStub;
  let existsStub;
  let findOneAndUpdateStub;
  let getDbConnectionStub;
  let fetchCommandeInfoStub;
  let fetchFormatPlaqueStub;
  let fetchPrixTotalStub;
  let fetchLivraisonDatesStub;
  let fakeConnection;

  const sinceDate = new Date("2026-08-01");

  beforeEach(() => {
    fakeConnection = { close: sinon.stub().resolves() };
    listCandidatsStub = sinon.stub(dossierService, "listCommandesRecentes");
    existsStub = sinon.stub(Deco, "exists");
    findOneAndUpdateStub = sinon.stub(Deco, "findOneAndUpdate").resolves();
    getDbConnectionStub = sinon.stub(dbConfig, "getDbConnection").resolves(fakeConnection);
    fetchCommandeInfoStub = sinon.stub(dossierService, "fetchDossierCommandeInfo").resolves({
      dateCommande: new Date("2026-08-20"),
      codeClient: "LM019",
      refClient: "82329874 - FASSOT",
      nombreProfil: 6,
      nombreKitPose: 5,
    });
    fetchFormatPlaqueStub = sinon.stub(dossierService, "fetchDossierFormatPlaque").resolves("1510 x 2600");
    fetchPrixTotalStub = sinon.stub(dossierService, "fetchDossierPrixTotal").resolves(1250.5);
    fetchLivraisonDatesStub = sinon
      .stub(dossierService, "fetchDossierLivraisonDates")
      .resolves({ dateLivraisonSouhaitee: new Date("2026-09-23") });
  });

  afterEach(() => {
    sinon.restore();
  });

  it("ne traite rien et ne touche pas Gamesys quand il n'y a aucun candidat", async () => {
    listCandidatsStub.resolves([]);

    const resume = await syncDecoStubsDepuisGamesys({ sinceDate });

    expect(resume).to.deep.equal({ candidats: 0, dejaExistants: 0, crees: 0, erreurs: 0 });
    expect(getDbConnectionStub.called).to.be.false;
  });

  it("ignore les dossiers déjà présents dans Deco sans requêter Gamesys pour eux", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);
    existsStub.resolves(true);

    const resume = await syncDecoStubsDepuisGamesys({ sinceDate });

    expect(resume).to.include({ candidats: 1, dejaExistants: 1, crees: 0, erreurs: 0 });
    expect(getDbConnectionStub.called).to.be.false;
  });

  it("en dry-run, compte les candidats sans écrire", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);
    existsStub.resolves(false);

    const resume = await syncDecoStubsDepuisGamesys({ sinceDate, dryRun: true });

    expect(resume).to.include({ candidats: 1, dejaExistants: 0, crees: 0, erreurs: 0 });
    expect(findOneAndUpdateStub.called).to.be.false;
  });

  it("crée un stub gamesysStub:true avec les champs Gamesys peuplés pour un dossier nouveau", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);
    existsStub.resolves(false);

    const resume = await syncDecoStubsDepuisGamesys({ sinceDate });

    expect(resume).to.include({ candidats: 1, dejaExistants: 0, crees: 1, erreurs: 0 });
    expect(findOneAndUpdateStub.calledOnce).to.be.true;
    const [filter, update, options] = findOneAndUpdateStub.firstCall.args;
    expect(filter).to.deep.equal({ numCmd: 167648 });
    expect(options).to.deep.equal({ upsert: true });
    expect(update.$setOnInsert).to.include({
      numCmd: 167648,
      client: "LM",
      status: "",
      gamesysStub: true,
      codeClient: "LM019",
      refClient: "82329874 - FASSOT",
      nombreProfil: 6,
      nombreKitPose: 5,
      formatPlaqueGamesys: "1510 x 2600",
      prixTotal: 1250.5,
    });
    expect(fakeConnection.close.calledOnce).to.be.true;
  });

  it("comptabilise les erreurs sans interrompre le traitement des autres candidats", async () => {
    listCandidatsStub.resolves([
      { cmd: "167648", client: "LM" },
      { cmd: "167649", client: "LM" },
    ]);
    existsStub.resolves(false);
    fetchCommandeInfoStub.withArgs(fakeConnection, "167648").rejects(new Error("ODBC timeout"));
    fetchCommandeInfoStub.withArgs(fakeConnection, "167649").resolves({
      dateCommande: new Date("2026-08-20"),
      codeClient: "LM019",
      refClient: "REF",
      nombreProfil: 0,
      nombreKitPose: 0,
    });

    const resume = await syncDecoStubsDepuisGamesys({ sinceDate });

    expect(resume.erreurs).to.equal(1);
    expect(resume.crees).to.equal(1);
  });

  it("ignore les candidats avec un cmd non numérique", async () => {
    listCandidatsStub.resolves([{ cmd: "abc", client: "LM" }]);

    const resume = await syncDecoStubsDepuisGamesys({ sinceDate });

    expect(resume.candidats).to.equal(1);
    expect(existsStub.called).to.be.false;
    expect(getDbConnectionStub.called).to.be.false;
  });
});
