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
});
