const { expect } = require("chai");
const sinon = require("sinon");

const dossierService = require("../../server/src/gamesys/services/dossierService");
const dbConfig = require("../../server/src/gamesys/config/db");
const { closeConnection } = require("../../server/src/gamesys/lib/db");
const Deco = require("../../server/src/models/Deco");
const {
  backfillDecoPrixVisuel,
  repairDecoPrixVisuel,
  matchPrixVisuel,
} = require("../../server/src/services/decoPrixVisuelBackfillService");

const ENTETE_TWO_VISUELS = [
  { endv_identif: "VISUEL MOSAIQUE", endv_px_total: 243.69, endv_ref_client: "V001" },
  { endv_identif: "VISUEL RAYURES", endv_px_total: 187.5, endv_ref_client: "V002" },
];

describe("decoPrixVisuelBackfillService.backfillDecoPrixVisuel()", () => {
  let findStub;
  let updateOneStub;
  let fetchEnteteDevisStub;
  let getDbConnectionStub;
  let fakeConnection;

  beforeEach(() => {
    findStub = sinon.stub(Deco, "find").returns({ lean: sinon.stub() });
    updateOneStub = sinon.stub(Deco, "updateOne").resolves({ modifiedCount: 0 });
    fakeConnection = { close: sinon.stub().resolves() };
    getDbConnectionStub = sinon.stub(dbConfig, "getDbConnection").resolves(fakeConnection);
    fetchEnteteDevisStub = sinon.stub(dossierService, "fetchEnteteDevis");
  });

  afterEach(() => {
    sinon.restore();
  });

  function mockPendingDocs(docs) {
    findStub.returns({ lean: sinon.stub().resolves(docs) });
  }

  it("interroge Deco sur les documents avec numCmd>0 sans prix", async () => {
    mockPendingDocs([]);

    await backfillDecoPrixVisuel({ dryRun: false });

    expect(findStub.calledOnce).to.be.true;
    expect(findStub.firstCall.args[0]).to.deep.equal({
      numCmd: { $gt: 0 },
      prix: { $exists: false },
    });
  });

  it("ajoute createdAt au filtre quand sinceDate est fourni", async () => {
    mockPendingDocs([]);
    const sinceDate = new Date("2026-08-18T00:00:00.000Z");

    await backfillDecoPrixVisuel({ dryRun: false, sinceDate });

    expect(findStub.firstCall.args[0]).to.deep.equal({
      numCmd: { $gt: 0 },
      prix: { $exists: false },
      createdAt: { $gte: sinceDate },
    });
  });

  it("ne modifie rien en dry-run, sans ouvrir de connexion Gamesys", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 100473, ref: "V001" }]);

    const resume = await backfillDecoPrixVisuel({ dryRun: true });

    expect(resume.candidats).to.equal(1);
    expect(getDbConnectionStub.called).to.be.false;
    expect(updateOneStub.called).to.be.false;
  });

  it("réutilise une seule connexion ODBC pour tout le run (un seul fetchEnteteDevis par numCmd)", async () => {
    mockPendingDocs([
      { _id: "a", numCmd: 164629, ref: "V001" },
      { _id: "b", numCmd: 164629, ref: "V002" },
    ]);
    fetchEnteteDevisStub.resolves(ENTETE_TWO_VISUELS);
    updateOneStub.resolves({ modifiedCount: 1 });

    const resume = await backfillDecoPrixVisuel({ dryRun: false });

    expect(getDbConnectionStub.calledOnce).to.be.true;
    expect(fetchEnteteDevisStub.callCount).to.equal(1);
    expect(fetchEnteteDevisStub.calledWith(fakeConnection, "164629", null, null)).to.be.true;
    expect(resume.misAJour).to.equal(2);
    expect(updateOneStub.calledWith({ _id: "a", prix: { $exists: false } }, { $set: { prix: 243.69 } })).to.be.true;
    expect(updateOneStub.calledWith({ _id: "b", prix: { $exists: false } }, { $set: { prix: 187.5 } })).to.be.true;
    expect(fakeConnection.close.calledOnce).to.be.true;
  });

  it("compte introuvable quand aucune ligne ne matche le visuel, sans écrire", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 999999, ref: "INCONNUE", deco: "AUTRE" }]);
    fetchEnteteDevisStub.resolves(ENTETE_TWO_VISUELS);

    const resume = await backfillDecoPrixVisuel({ dryRun: false });

    expect(resume.introuvables).to.equal(1);
    expect(resume.misAJour).to.equal(0);
    expect(updateOneStub.called).to.be.false;
  });

  it("prend le prix de l'unique ligne visuel quand c'est le seul document Deco du numCmd (fallback ligne unique)", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 167637, ref: "3664715811077", deco: "terrazzo gris", format: "255x60" }]);
    fetchEnteteDevisStub.resolves([
      { endv_identif: "255x60cm TERRAZZO GR BEIGE (M)", endv_px_total: 310, endv_ref_client: "" },
    ]);
    updateOneStub.resolves({ modifiedCount: 1 });

    const resume = await backfillDecoPrixVisuel({ dryRun: false });

    expect(resume.misAJour).to.equal(1);
    expect(updateOneStub.calledWith({ _id: "a", prix: { $exists: false } }, { $set: { prix: 310 } })).to.be.true;
  });

  it("n'applique pas le fallback ligne unique quand 2 documents Deco partagent le numCmd (crédence amalgamée)", async () => {
    mockPendingDocs([
      { _id: "a", numCmd: 167637, ref: "", deco: "terrazzo gris", format: "255x60" },
      { _id: "b", numCmd: 167637, ref: "", deco: "autre visuel", format: "255x60" },
    ]);
    fetchEnteteDevisStub.resolves([
      { endv_identif: "255x60cm TERRAZZO GR BEIGE (M)", endv_px_total: 310, endv_ref_client: "" },
    ]);

    const resume = await backfillDecoPrixVisuel({ dryRun: false });

    expect(resume.introuvables).to.equal(2);
    expect(updateOneStub.called).to.be.false;
  });

  it("limite la requête Deco.find aux numCmds fournis quand l'option est passée", async () => {
    mockPendingDocs([]);

    await backfillDecoPrixVisuel({ dryRun: false, numCmds: [164629, 165675] });

    expect(findStub.firstCall.args[0]).to.deep.equal({
      numCmd: { $in: [164629, 165675] },
      prix: { $exists: false },
    });
  });

  it("compte erreur et continue si fetchEnteteDevis échoue pour un numCmd", async () => {
    mockPendingDocs([
      { _id: "a", numCmd: 1, ref: "X" },
      { _id: "b", numCmd: 2, ref: "V001" },
    ]);
    fetchEnteteDevisStub.withArgs(fakeConnection, "1", null, null).rejects(new Error("ODBC timeout"));
    fetchEnteteDevisStub.withArgs(fakeConnection, "2", null, null).resolves(ENTETE_TWO_VISUELS);
    updateOneStub.resolves({ modifiedCount: 1 });

    const resume = await backfillDecoPrixVisuel({ dryRun: false });

    expect(resume.erreurs).to.equal(1);
    expect(resume.misAJour).to.equal(1);
  });

  it("ferme la connexion même si un numCmd échoue", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 1, ref: "X" }]);
    fetchEnteteDevisStub.rejects(new Error("boom"));

    await backfillDecoPrixVisuel({ dryRun: false });

    expect(fakeConnection.close.calledOnce).to.be.true;
  });
});

describe("decoPrixVisuelBackfillService.repairDecoPrixVisuel()", () => {
  let findStub;
  let updateOneStub;
  let fetchEnteteDevisStub;
  let getDbConnectionStub;
  let fakeConnection;

  const ROWS_DEUX_FORMATS = [
    { endv_identif: "JARDIN SECRET GAUCHE 100x255cm", endv_px_total: 199.39, endv_ref_client: "" },
    { endv_identif: "JARDIN SECRET GAUCHE 150x255cm", endv_px_total: 243.69, endv_ref_client: "" },
  ];

  beforeEach(() => {
    findStub = sinon.stub(Deco, "find").returns({ lean: sinon.stub() });
    updateOneStub = sinon.stub(Deco, "updateOne").resolves({ modifiedCount: 1 });
    fakeConnection = { close: sinon.stub().resolves() };
    getDbConnectionStub = sinon.stub(dbConfig, "getDbConnection").resolves(fakeConnection);
    fetchEnteteDevisStub = sinon.stub(dossierService, "fetchEnteteDevis");
  });

  afterEach(() => {
    sinon.restore();
  });

  function mockDocs(docs) {
    findStub.returns({ lean: sinon.stub().resolves(docs) });
  }

  it("interroge tous les documents numCmd>0, prix rempli ou non", async () => {
    mockDocs([]);

    await repairDecoPrixVisuel({ dryRun: false });

    expect(findStub.firstCall.args[0]).to.deep.equal({ numCmd: { $gt: 0 } });
  });

  it("corrige un prix erroné détecté par la désambiguïsation par format (cas 167602)", async () => {
    mockDocs([{ _id: "a", numCmd: 167602, ref: "94964359", deco: "JARDIN SECRET GAUCHE", format: "150x255", prix: 199.39 }]);
    fetchEnteteDevisStub.resolves(ROWS_DEUX_FORMATS);

    const resume = await repairDecoPrixVisuel({ dryRun: false });

    expect(resume.corriges).to.equal(1);
    expect(updateOneStub.calledWith({ _id: "a" }, { $set: { prix: 243.69 } })).to.be.true;
  });

  it("ne touche pas un prix déjà correct", async () => {
    mockDocs([{ _id: "b", numCmd: 167602, ref: "94956940", deco: "JARDIN SECRET GAUCHE", format: "100x255", prix: 199.39 }]);
    fetchEnteteDevisStub.resolves(ROWS_DEUX_FORMATS);

    const resume = await repairDecoPrixVisuel({ dryRun: false });

    expect(resume.inchanges).to.equal(1);
    expect(updateOneStub.called).to.be.false;
  });

  it("ne modifie rien en dry-run", async () => {
    mockDocs([{ _id: "a", numCmd: 167602, ref: "94964359", format: "150x255", prix: 199.39 }]);

    const resume = await repairDecoPrixVisuel({ dryRun: true });

    expect(resume.candidats).to.equal(1);
    expect(getDbConnectionStub.called).to.be.false;
  });
});

describe("decoPrixVisuelBackfillService.matchPrixVisuel()", () => {
  it("matche par référence explicite du devis (endv_ref_client)", () => {
    expect(matchPrixVisuel(ENTETE_TWO_VISUELS, { ref: "V002" })).to.equal(187.5);
  });

  it("se rabat sur le libellé (deco) quand la référence ne matche aucune ligne", () => {
    expect(matchPrixVisuel(ENTETE_TWO_VISUELS, { ref: "INCONNUE", deco: "MOSAIQUE" })).to.equal(243.69);
  });

  it("retourne undefined si ni la référence ni le libellé ne matchent", () => {
    expect(matchPrixVisuel(ENTETE_TWO_VISUELS, { ref: "INCONNUE", deco: "AUTRE CHOSE" })).to.be.undefined;
  });

  it("ignore les lignes profil/kit lors du matching", () => {
    const rows = [
      { endv_identif: "PROFIL BLANC 255", endv_px_total: 34.39, endv_ref_client: "P001" },
      { endv_identif: "VISUEL MOSAIQUE", endv_px_total: 243.69, endv_ref_client: "V001" },
    ];
    expect(matchPrixVisuel(rows, { ref: "P001" })).to.be.undefined;
  });

  it("désambiguïse par format quand deux formats du même visuel matchent le libellé (cas réel cmd 167602)", () => {
    const rows = [
      { endv_identif: "JARDIN SECRET GAUCHE 100x255cm", endv_px_total: 199.39, endv_ref_client: "" },
      { endv_identif: "JARDIN SECRET GAUCHE 150x255cm", endv_px_total: 243.69, endv_ref_client: "" },
    ];
    expect(matchPrixVisuel(rows, { deco: "JARDIN SECRET GAUCHE", format: "150x255" })).to.equal(243.69);
    expect(matchPrixVisuel(rows, { deco: "JARDIN SECRET GAUCHE", format: "100x255" })).to.equal(199.39);
  });

  it("sans format fourni, retombe sur la première ligne trouvée (comportement dégradé mais non bloquant)", () => {
    const rows = [
      { endv_identif: "JARDIN SECRET GAUCHE 100x255cm", endv_px_total: 199.39, endv_ref_client: "" },
      { endv_identif: "JARDIN SECRET GAUCHE 150x255cm", endv_px_total: 243.69, endv_ref_client: "" },
    ];
    expect(matchPrixVisuel(rows, { deco: "JARDIN SECRET GAUCHE" })).to.equal(199.39);
  });

  it("désambiguïse par orientation via le suffixe D/G de ref quand deco ne porte pas l'orientation (cas réel cmd 166212)", () => {
    const rows = [
      { endv_identif: "Hokusai Droit 150 x 210 cm (M)", endv_px_total: 283.51, endv_ref_client: "" },
      { endv_identif: "Hokusai Gauche 150 x 210 cm (M)", endv_px_total: 557.35, endv_ref_client: "" },
    ];
    expect(matchPrixVisuel(rows, { ref: "HOKUSAID-150210", deco: "HOKUSAI" })).to.equal(283.51);
    expect(matchPrixVisuel(rows, { ref: "HOKUSAIG-150210", deco: "HOKUSAI" })).to.equal(557.35);
  });

  it("désambiguïse par orientation portée directement dans deco (sans suffixe ref)", () => {
    const rows = [
      { endv_identif: "Marbre iridescent Droit 100 x 255 cm (B)", endv_px_total: 236.35, endv_ref_client: "" },
      { endv_identif: "Marbre iridescent Gauche 100 x 255 cm (B)", endv_px_total: 465.08, endv_ref_client: "" },
    ];
    expect(matchPrixVisuel(rows, { deco: "MARBRE IRIDESCENT GAUCHE" })).to.equal(465.08);
  });

  it("matche par endv_ref_client quand endv_identif est un libellé générique identique sur plusieurs lignes (cas réel cmd 167500, BAMBUSA)", () => {
    const rows = [
      {
        endv_identif: " Format fini : 100.0 x 255.0 cm ",
        endv_px_total: 229.39,
        endv_ref_client: "BAMBUSA DROITE 80 X 230 MAT",
      },
      {
        endv_identif: " Format fini : 100.0 x 255.0 cm ",
        endv_px_total: 258.12,
        endv_ref_client: "BAMBUSA GAUCHE 100 X 230 MAT",
      },
    ];
    expect(matchPrixVisuel(rows, { ref: "", deco: "BAMBUSA GAUCHE", format: "100x230" })).to.equal(258.12);
    expect(matchPrixVisuel(rows, { ref: "", deco: "BAMBUSA DROITE", format: "80x230" })).to.equal(229.39);
  });

  it("désambiguïse par format via endv_ref_client, séparateur décimal ',' (Mongo) aligné sur '.' (Gamesys) — cas réel cmd 167431, ARCHE BEIGE sur-mesure", () => {
    const rows = [
      {
        endv_identif: "Panneau déco sur-mesure 100x210 Finition Texturée",
        endv_px_total: 189.79,
        endv_ref_client: "ARCHE BEIGE CENTRE 86.9 X 201.5 MAT",
      },
      {
        endv_identif: "Panneau déco sur-mesure 125x210 Finition Texturée",
        endv_px_total: 230.46,
        endv_ref_client: "ARCHE BEIGE GAUCHE 119.6 X 201.5 MAT",
      },
      {
        endv_identif: "Panneau déco sur-mesure 125x210 Finition Texturée",
        endv_px_total: 199.0,
        endv_ref_client: "ARCHE BEIGE DROIT 117.8 X 201.5 MAT",
      },
    ];
    expect(matchPrixVisuel(rows, { ref: "", deco: "ARCHE BEIGE", format: "86,9x201,5" })).to.equal(189.79);
    expect(matchPrixVisuel(rows, { ref: "", deco: "ARCHE BEIGE", format: "119,6x201,5" })).to.equal(230.46);
    expect(matchPrixVisuel(rows, { ref: "", deco: "ARCHE BEIGE", format: "117,8x201,5" })).to.equal(199.0);
  });

  it("désambiguïse par le paramètre orientation quand deco est nettoyé (pas d'orientation dans deco/ref)", () => {
    // DROIT en 1er : sans le param, matchPrixVisuel renvoie candidates[0] = 199.0 → le test échoue.
    const rows = [
      { endv_identif: "Panneau déco sur-mesure 125x210 Finition Texturée", endv_px_total: 199.0,  endv_ref_client: "ARCHE BEIGE DROIT 117.8 X 201.5 MAT" },
      { endv_identif: "Panneau déco sur-mesure 125x210 Finition Texturée", endv_px_total: 230.46, endv_ref_client: "ARCHE BEIGE GAUCHE 119.6 X 201.5 MAT" },
    ];
    const prix = matchPrixVisuel(rows, { ref: "ARCHE BEIGE", deco: "ARCHE BEIGE", format: "125x210", orientation: "GAUCHE" });
    expect(prix).to.equal(230.46);
  });

  it("n'additionne pas les prix de lignes partageant le même endv_identif (non-régression getPrixForArticle)", () => {
    const rows = [
      { endv_identif: "MEME LIBELLE", endv_px_total: 100, endv_ref_client: "PRODUIT A" },
      { endv_identif: "MEME LIBELLE", endv_px_total: 250, endv_ref_client: "PRODUIT B" },
    ];
    expect(matchPrixVisuel(rows, { ref: "", deco: "PRODUIT A" })).to.equal(100);
    expect(matchPrixVisuel(rows, { ref: "", deco: "PRODUIT B" })).to.equal(250);
  });

  it("prend le prix de l'unique ligne visuel quand le texte ne matche pas et qu'il n'y a qu'un seul document Deco pour ce numCmd (cas réel cmd 167637, terrazzo gris / TERRAZZO GR BEIGE)", () => {
    const rows = [{ endv_identif: "255x60cm TERRAZZO GR BEIGE (M)", endv_px_total: 310, endv_ref_client: "" }];
    expect(matchPrixVisuel(rows, { ref: "3664715811077", deco: "terrazzo gris", format: "255x60", soleDoc: true })).to.equal(310);
  });

  it("ne devine pas le prix de la ligne unique si plusieurs documents Deco partagent le numCmd (garde-fou crédences amalgamées)", () => {
    const rows = [{ endv_identif: "255x60cm TERRAZZO GR BEIGE (M)", endv_px_total: 310, endv_ref_client: "" }];
    expect(matchPrixVisuel(rows, { ref: "3664715811077", deco: "terrazzo gris", format: "255x60", soleDoc: false })).to
      .be.undefined;
  });

  it("n'applique pas le fallback ligne unique quand plusieurs lignes visuel existent (rien à désambiguïser en toute sécurité)", () => {
    expect(matchPrixVisuel(ENTETE_TWO_VISUELS, { ref: "", deco: "AUTRE CHOSE", soleDoc: true })).to.be.undefined;
  });

  it("sans soleDoc (valeur par défaut), n'applique pas le fallback ligne unique", () => {
    const rows = [{ endv_identif: "255x60cm TERRAZZO GR BEIGE (M)", endv_px_total: 310, endv_ref_client: "" }];
    expect(matchPrixVisuel(rows, { ref: "", deco: "terrazzo gris" })).to.be.undefined;
  });
});
