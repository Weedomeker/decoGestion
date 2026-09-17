const { expect } = require("chai");
const sinon = require("sinon");

const dossierService = require("../../server/src/gamesys/services/dossierService");
const dbConfig = require("../../server/src/gamesys/config/db");
const Deco = require("../../server/src/models/Deco");
const {
  backfillDecoSousDossier,
  matchSousDossier,
  matchSousDossierViaJoin,
  matchSousDossierViaTexte,
} = require("../../server/src/services/decoSousDossierBackfillService");

const ROWS_165594 = [
  { endv_no_commande: "165594/00", endv_identif: "ONYX GAUCHE 125x255cm" },
  { endv_no_commande: "165594/01", endv_identif: "ONYX GAUCHE 150x255cm" },
  { endv_no_commande: "165594/02", endv_identif: "ONYX GAUCHE 100x210cm" },
  { endv_no_commande: "165594/03", endv_identif: "ONYX DROITE 100x255cm" },
];

describe("decoSousDossierBackfillService.matchSousDossierViaTexte() (repli texte)", () => {
  it("résout sans ambiguïté chacun des 4 visuels du dossier réel 165594", () => {
    expect(matchSousDossierViaTexte(ROWS_165594, "ONYX GAUCHE", "125x255")).to.equal("00");
    expect(matchSousDossierViaTexte(ROWS_165594, "ONYX GAUCHE", "150x255")).to.equal("01");
    expect(matchSousDossierViaTexte(ROWS_165594, "ONYX GAUCHE", "100x210")).to.equal("02");
    expect(matchSousDossierViaTexte(ROWS_165594, "ONYX DROITE", "100x255")).to.equal("03");
  });

  it("retourne null (ambigu) quand plusieurs sous-dossiers partagent le même format et qu'aucun nom ne les distingue", () => {
    const rows = [
      { endv_no_commande: "167637/00", endv_identif: "MOSAIQUE 300x60cm" },
      { endv_no_commande: "167637/01", endv_identif: "MARBRE BLANC 300x60cm" },
    ];
    expect(matchSousDossierViaTexte(rows, "AUTRE VISUEL", "300x60")).to.be.null;
  });

  it("désambiguïse par nom quand le format seul ne suffit pas (ex: crédence amalgamée)", () => {
    const rows = [
      { endv_no_commande: "167637/00", endv_identif: "MOSAIQUE 300x60cm" },
      { endv_no_commande: "167637/01", endv_identif: "MARBRE BLANC 300x60cm" },
    ];
    expect(matchSousDossierViaTexte(rows, "MOSAIQUE", "300x60")).to.equal("00");
    expect(matchSousDossierViaTexte(rows, "MARBRE BLANC", "300x60")).to.equal("01");
  });

  it("retourne null si aucune ligne ne matche le format", () => {
    expect(matchSousDossierViaTexte(ROWS_165594, "ONYX GAUCHE", "999x999")).to.be.null;
  });

  it("retourne null si le format est absent", () => {
    expect(matchSousDossierViaTexte(ROWS_165594, "ONYX GAUCHE", "")).to.be.null;
    expect(matchSousDossierViaTexte(ROWS_165594, "ONYX GAUCHE", undefined)).to.be.null;
  });
});

// matchSousDossierViaJoin interroge fs_stock via connection.query(sql, params) — comme toutes les
// fonctions connection-injectées de dossierService.js (fetchDossierPrixTotal, etc.), on simule donc
// directement connection.query plutôt que de stubber un module (aucun appel MongoDB dans ce chemin).
describe("decoSousDossierBackfillService.matchSousDossierViaJoin() (jointure fs_stock pure, sans Mongo)", () => {
  it("résout le sous-dossier dont le libellé catalogue correspond à endv_identif (cas réel 165594)", async () => {
    const connection = {
      query: sinon.stub().resolves([{ st_lib_1_conso: "ONYX GAUCHE 125x255cm (M)", st_lib_2_conso: "" }]),
    };

    const result = await matchSousDossierViaJoin(connection, ROWS_165594, "94964437");

    expect(result).to.equal("00");
    const [sql, params] = connection.query.firstCall.args;
    expect(sql).to.match(/fs_stock/);
    expect(sql).to.match(/st_art_ref_client/);
    expect(sql).to.match(/st_modele/);
    expect(params).to.deep.equal(["94964437", "94964437"]);
  });

  it("recoupe par recouvrement de termes, pas par égalité stricte (libellés catalogue vs commande diffèrent, cas réel 167648)", async () => {
    const connection = {
      query: sinon.stub().resolves([{ st_lib_1_conso: "PROFILE Alu Mat - A - Finition - 255cm", st_lib_2_conso: "" }]),
    };
    const rows = [
      { endv_no_commande: "167648/05", endv_identif: "PROFILE DE FINITION ALU MAT 255cm" },
      { endv_no_commande: "167648/04", endv_identif: "PROFILE DE RACCORD ALU MAT 255cm" },
    ];

    expect(await matchSousDossierViaJoin(connection, rows, "94953589")).to.equal("05");
  });

  it("retourne null si ref est absente de fs_stock", async () => {
    const connection = { query: sinon.stub().resolves([]) };

    expect(await matchSousDossierViaJoin(connection, ROWS_165594, "REF_INCONNUE")).to.be.null;
  });

  it("retourne null si plusieurs lignes du dossier correspondent au libellé catalogue (ambigu)", async () => {
    const connection = {
      query: sinon.stub().resolves([{ st_lib_1_conso: "MOSAIQUE 300x60cm (M)", st_lib_2_conso: "" }]),
    };
    const rows = [
      { endv_no_commande: "1/00", endv_identif: "MOSAIQUE 300x60cm" },
      { endv_no_commande: "1/01", endv_identif: "MOSAIQUE 300x60cm" },
    ];

    expect(await matchSousDossierViaJoin(connection, rows, "REF1")).to.be.null;
  });

  it("retourne null si ref est absent, sans requêter fs_stock", async () => {
    const connection = { query: sinon.stub() };

    expect(await matchSousDossierViaJoin(connection, ROWS_165594, "")).to.be.null;
    expect(connection.query.called).to.be.false;
  });
});

describe("decoSousDossierBackfillService.matchSousDossier() (jointure Gamesys prioritaire, texte en repli)", () => {
  it("utilise la jointure quand elle résout un candidat unique, sans recourir au texte", async () => {
    const connection = {
      query: sinon.stub().resolves([{ st_lib_1_conso: "ONYX GAUCHE 125x255cm (M)", st_lib_2_conso: "" }]),
    };

    const result = await matchSousDossier(connection, ROWS_165594, {
      ref: "94964437",
      deco: "ONYX GAUCHE",
      format: "125x255",
    });

    expect(result).to.deep.equal({ sousDossier: "00", origine: "jointure" });
  });

  it("retombe sur le texte quand la jointure ne résout rien (ref absente de fs_stock)", async () => {
    const connection = { query: sinon.stub().resolves([]) };

    const result = await matchSousDossier(connection, ROWS_165594, {
      ref: "REF_INCONNUE_DE_GAMESYS",
      deco: "ONYX DROITE",
      format: "100x255",
    });

    expect(result).to.deep.equal({ sousDossier: "03", origine: "texte" });
  });

  it("retourne sousDossier:null quand ni la jointure ni le texte ne résolvent", async () => {
    const connection = { query: sinon.stub().resolves([]) };

    const result = await matchSousDossier(connection, ROWS_165594, {
      ref: "REF_INCONNUE",
      deco: "AUTRE VISUEL",
      format: "999x999",
    });

    expect(result).to.deep.equal({ sousDossier: null, origine: null });
  });
});

describe("decoSousDossierBackfillService.backfillDecoSousDossier()", () => {
  let findStub;
  let updateOneStub;
  let getDbConnectionStub;
  let fetchEnteteDevisStub;
  let fakeConnection;

  beforeEach(() => {
    // query (jointure fs_stock) résout [] par défaut — force le repli texte pour la plupart des tests.
    fakeConnection = { close: sinon.stub().resolves(), query: sinon.stub().resolves([]) };
    findStub = sinon.stub(Deco, "find").returns({ lean: sinon.stub() });
    updateOneStub = sinon.stub(Deco, "updateOne").resolves({ modifiedCount: 1 });
    getDbConnectionStub = sinon.stub(dbConfig, "getDbConnection").resolves(fakeConnection);
    fetchEnteteDevisStub = sinon.stub(dossierService, "fetchEnteteDevis");
  });

  afterEach(() => {
    sinon.restore();
  });

  function mockPendingDocs(docs) {
    findStub.returns({ lean: sinon.stub().resolves(docs) });
  }

  it("interroge Deco sur les documents avec numCmd>0, ref présent et sousDossier absent", async () => {
    mockPendingDocs([]);

    await backfillDecoSousDossier({ dryRun: false });

    expect(findStub.calledOnce).to.be.true;
    expect(findStub.firstCall.args[0]).to.deep.equal({
      numCmd: { $gt: 0 },
      ref: { $exists: true, $ne: null },
      sousDossier: { $exists: false },
    });
  });

  it("ne modifie rien en dry-run", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 165594, ref: "94964437", deco: "ONYX GAUCHE", format: "125x255" }]);

    const resume = await backfillDecoSousDossier({ dryRun: true });

    expect(resume.candidats).to.equal(1);
    expect(getDbConnectionStub.called).to.be.false;
    expect(updateOneStub.called).to.be.false;
  });

  it("déduplique par numCmd : un seul appel fetchEnteteDevis pour plusieurs documents partageant le même numCmd", async () => {
    mockPendingDocs([
      { _id: "a", numCmd: 165594, ref: "94964437", deco: "ONYX GAUCHE", format: "125x255" },
      { _id: "b", numCmd: 165594, ref: "94964438", deco: "ONYX GAUCHE", format: "150x255" },
    ]);
    fetchEnteteDevisStub.withArgs(fakeConnection, "165594", "", null).resolves(ROWS_165594);

    const resume = await backfillDecoSousDossier({ dryRun: false });

    expect(fetchEnteteDevisStub.callCount).to.equal(1);
    expect(resume.misAJour).to.equal(2);
    expect(resume.resolusParTexte).to.equal(2);
    expect(updateOneStub.calledWith({ _id: "a" }, { $set: { sousDossier: "00" } })).to.be.true;
    expect(updateOneStub.calledWith({ _id: "b" }, { $set: { sousDossier: "01" } })).to.be.true;
    expect(fakeConnection.close.calledOnce).to.be.true;
  });

  it("compte une résolution par jointure séparément d'une résolution par texte", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 165594, ref: "94964437", deco: "ONYX GAUCHE", format: "125x255" }]);
    fetchEnteteDevisStub.resolves(ROWS_165594);
    fakeConnection.query.resolves([{ st_lib_1_conso: "ONYX GAUCHE 125x255cm (M)", st_lib_2_conso: "" }]);

    const resume = await backfillDecoSousDossier({ dryRun: false });

    expect(resume.misAJour).to.equal(1);
    expect(resume.resolusParJointure).to.equal(1);
    expect(resume.resolusParTexte).to.equal(0);
  });

  it("compte ambigu sans écrire quand ni la jointure ni le texte ne résolvent un candidat unique", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 167637, ref: "REF1", deco: "AUTRE VISUEL", format: "300x60" }]);
    fetchEnteteDevisStub.resolves([
      { endv_no_commande: "167637/00", endv_identif: "MOSAIQUE 300x60cm" },
      { endv_no_commande: "167637/01", endv_identif: "MARBRE BLANC 300x60cm" },
    ]);

    const resume = await backfillDecoSousDossier({ dryRun: false });

    expect(resume.ambigus).to.equal(1);
    expect(resume.misAJour).to.equal(0);
    expect(updateOneStub.called).to.be.false;
  });

  it("compte erreur et continue si un numCmd échoue", async () => {
    mockPendingDocs([
      { _id: "a", numCmd: 1, ref: "R1", deco: "V1", format: "100x255" },
      { _id: "b", numCmd: 2, ref: "R2", deco: "V2", format: "100x255" },
    ]);
    fetchEnteteDevisStub.withArgs(fakeConnection, "1", "", null).rejects(new Error("ODBC timeout"));
    fetchEnteteDevisStub
      .withArgs(fakeConnection, "2", "", null)
      .resolves([{ endv_no_commande: "2/00", endv_identif: "V2 100x255cm" }]);

    const resume = await backfillDecoSousDossier({ dryRun: false });

    expect(resume.erreurs).to.equal(1);
    expect(resume.misAJour).to.equal(1);
  });

  it("ferme la connexion même si un numCmd échoue", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 1, ref: "R1", deco: "V1", format: "100x255" }]);
    fetchEnteteDevisStub.rejects(new Error("boom"));

    await backfillDecoSousDossier({ dryRun: false });

    expect(fakeConnection.close.calledOnce).to.be.true;
  });
});
