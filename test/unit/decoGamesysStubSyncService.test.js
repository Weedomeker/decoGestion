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
      prixTotal: 1250.5,
    });
    fetchFormatPlaqueStub = sinon.stub(dossierService, "fetchDossierFormatPlaque").resolves("1510 x 2600");
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
      status: "A lancer",
      gamesysStub: true,
      codeClient: "LM019",
      refClient: "82329874 - FASSOT",
      nombreProfil: 6,
      nombreKitPose: 5,
      formatPlaqueGamesys: "1510 x 2600",
      prixTotal: 1250.5,
      pkOnly: true,
    });
    expect(fakeConnection.close.calledOnce).to.be.true;
  });

  it("laisse pkOnly:false sur le stub générique quand la commande n'a ni visuel ni profil ni kit", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);
    existsStub.resolves(false);
    fetchCommandeInfoStub.resolves({
      dateCommande: new Date("2026-08-20"),
      codeClient: "LM019",
      refClient: "REF",
      nombreProfil: 0,
      nombreKitPose: 0,
    });

    await syncDecoStubsDepuisGamesys({ sinceDate });

    const [, update] = findOneAndUpdateStub.firstCall.args;
    expect(update.$setOnInsert.pkOnly).to.equal(false);
  });

  it("ouvre une connexion ODBC dédiée par candidat plutôt qu'une seule connexion partagée", async () => {
    listCandidatsStub.resolves([
      { cmd: "167648", client: "LM" },
      { cmd: "167649", client: "LM" },
    ]);
    existsStub.resolves(false);

    const resume = await syncDecoStubsDepuisGamesys({ sinceDate });

    expect(resume).to.include({ candidats: 2, dejaExistants: 0, crees: 2, erreurs: 0 });
    expect(getDbConnectionStub.callCount).to.equal(2);
    expect(fakeConnection.close.callCount).to.equal(2);
  });

  it("crée un stub par sous-dossier visuel avec ref/deco du catalogue quand la référence matche", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);
    existsStub.resolves(false);
    sinon.stub(dossierService, "fetchSousDossiersVisuels").resolves([
      {
        sousNumero: "07",
        printFinish: "MAT",
        formatFini: "126x260",
        visualReferences: [
          { reference: "REF123", libelle: "Jaspe Gauche 100 x 210 cm (M)", endv_px_total: 199.9, endv_quant: 2 },
        ],
      },
    ]);
    sinon.stub(Deco, "resolveRefFields").resolves({ matched: true, finition: "Mat", format: "100x210", deco: "JASPE" });

    const resume = await syncDecoStubsDepuisGamesys({ sinceDate });

    expect(resume.crees).to.equal(1);
    const call = findOneAndUpdateStub.getCalls().find((c) => c.args[0].sousDossier === "07");
    expect(call).to.exist;
    expect(call.args[1].$setOnInsert).to.include({
      numCmd: 167648,
      sousDossier: "07",
      ref: "REF123",
      finition: "Mat",
      format: "100x210",
      deco: "JASPE",
      ex: 2,
      prix: 199.9,
      status: "A lancer",
      gamesysStub: true,
    });
  });

  it("se rabat sur format/finition/deco Gamesys bruts quand la référence ne matche aucun catalogue", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);
    existsStub.resolves(false);
    sinon.stub(dossierService, "fetchSousDossiersVisuels").resolves([
      {
        sousNumero: "07",
        printFinish: "BRILLANT",
        formatFini: "126x260",
        visualReferences: [
          { reference: "TEXTE-LIBRE", libelle: "Jaspe Gauche 100 x 210 cm (M)", endv_px_total: 199.9, endv_quant: 2 },
        ],
      },
    ]);
    sinon.stub(Deco, "resolveRefFields").resolves({ matched: false, finition: "" });

    const resume = await syncDecoStubsDepuisGamesys({ sinceDate });

    expect(resume.crees).to.equal(1);
    const call = findOneAndUpdateStub.getCalls().find((c) => c.args[0].sousDossier === "07");
    expect(call).to.exist;
    const inserted = call.args[1].$setOnInsert;
    expect(inserted.ref).to.be.undefined;
    expect(inserted).to.include({
      numCmd: 167648,
      sousDossier: "07",
      format: "126x260",
      finition: "Brillant",
      deco: "Jaspe Gauche 100 x 210 cm (M)",
      status: "A lancer",
    });
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
