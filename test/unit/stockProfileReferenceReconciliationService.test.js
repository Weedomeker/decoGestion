const { expect } = require("chai");
const sinon = require("sinon");

const dossierService = require("../../server/src/gamesys/services/dossierService");
const StockProfile = require("../../server/src/models/StockProfile");
const ConsommationCommande = require("../../server/src/models/ConsommationCommande");
const {
  reconcileStockProfileReferences,
} = require("../../server/src/services/stockProfileReferenceReconciliationService");

describe("stockProfileReferenceReconciliationService.reconcileStockProfileReferences()", () => {
  let stockProfileFindStub;
  let consommationFindStub;
  let getDossierDetailStub;
  let updateOneStub;
  let deleteManyStub;

  function mockBrokenDocs(docs) {
    stockProfileFindStub.callsFake((filter) => {
      if (filter.ref && filter.ref.$not) {
        return { lean: sinon.stub().resolves(docs) };
      }
      if (filter.ref && filter.ref.$in) {
        return { lean: sinon.stub().resolves([]) };
      }
      return { lean: sinon.stub().resolves([]) };
    });
  }

  function mockExistingTargets(docs) {
    stockProfileFindStub.callsFake((filter) => {
      if (filter.ref && filter.ref.$not) {
        return { lean: sinon.stub().resolves(mockExistingTargets.brokenDocs || []) };
      }
      if (filter.ref && filter.ref.$in) {
        return { lean: sinon.stub().resolves(docs) };
      }
      return { lean: sinon.stub().resolves([]) };
    });
  }

  function mockCandidateNumCmds(mapping) {
    consommationFindStub.callsFake((filter) => {
      const numCmds = mapping[filter["articles.libelle"]] || [];
      return { lean: sinon.stub().resolves(numCmds.map((numCmd) => ({ numCmd }))) };
    });
  }

  beforeEach(() => {
    stockProfileFindStub = sinon.stub(StockProfile, "find");
    consommationFindStub = sinon.stub(ConsommationCommande, "find").returns({ lean: sinon.stub().resolves([]) });
    getDossierDetailStub = sinon.stub(dossierService, "getDossierDetail");
    updateOneStub = sinon.stub(StockProfile, "updateOne").resolves({});
    deleteManyStub = sinon.stub(StockProfile, "deleteMany").resolves({});
  });

  afterEach(() => {
    sinon.restore();
  });

  it("ne fait rien quand aucun StockProfile n'a de ref non numérique", async () => {
    mockBrokenDocs([]);

    const result = await reconcileStockProfileReferences();

    expect(result).to.deep.equal({ totalCasses: 0, resolus: 0, nonResolus: 0, actions: [], unresolved: [] });
    expect(consommationFindStub.called).to.be.false;
    expect(getDossierDetailStub.called).to.be.false;
  });

  it("signale un document non résolu si aucune commande source n'est retrouvée", async () => {
    mockBrokenDocs([
      { _id: "id1", ref: "CORNIERE PLATE 255cm", libelle: "CORNIERE PLATE 255cm", type: "profil", stockDisponible: 0 },
    ]);
    mockCandidateNumCmds({});

    const result = await reconcileStockProfileReferences();

    expect(result.nonResolus).to.equal(1);
    expect(result.resolus).to.equal(0);
    expect(result.unresolved[0].raison).to.match(/Aucune commande source/);
    expect(getDossierDetailStub.called).to.be.false;
  });

  it("met à jour le document cassé quand une ref numérique est trouvée sans doublon existant", async () => {
    mockBrokenDocs([
      { _id: "id1", ref: "CORNIERE PLATE 255cm", libelle: "CORNIERE PLATE 255cm", type: "profil", stockDisponible: 0 },
    ]);
    mockCandidateNumCmds({ "CORNIERE PLATE 255cm": [166279] });
    getDossierDetailStub.resolves({
      profileReferences: [
        {
          reference: "94911234",
          articleReference: "94911234",
          modele: "CORNIERE PLATE",
          libelle: "CORNIERE PLATE 255cm",
          codeTarif: "TARIF1",
          famille: "PROFILS",
          sousFamille: "",
        },
      ],
      kitPosesReferences: [],
    });

    const result = await reconcileStockProfileReferences();

    expect(result.resolus).to.equal(1);
    expect(result.actions).to.have.lengthOf(1);
    expect(result.actions[0].type).to.equal("update");
    expect(updateOneStub.calledOnce).to.be.true;
    const [filter, update] = updateOneStub.firstCall.args;
    expect(filter).to.deep.equal({ _id: "id1" });
    expect(update.$set).to.deep.equal({
      ref: "94911234",
      modele: "CORNIERE PLATE",
      codeArticle: "TARIF1",
      famille: "PROFILS",
    });
    expect(deleteManyStub.called).to.be.false;
  });

  it("fusionne dans un StockProfile numérique déjà existant en sommant stockDisponible", async () => {
    mockExistingTargets.brokenDocs = [
      { _id: "id1", ref: "CORNIERE PLATE 255cm", libelle: "CORNIERE PLATE 255cm", type: "profil", stockDisponible: 5 },
    ];
    mockExistingTargets([{ _id: "idExisting", ref: "94911234", stockDisponible: 10 }]);
    mockCandidateNumCmds({ "CORNIERE PLATE 255cm": [166279] });
    getDossierDetailStub.resolves({
      profileReferences: [
        { reference: "94911234", articleReference: "94911234", modele: "CORNIERE PLATE", libelle: "CORNIERE PLATE 255cm" },
      ],
      kitPosesReferences: [],
    });

    const result = await reconcileStockProfileReferences();

    expect(result.actions).to.have.lengthOf(1);
    expect(result.actions[0].type).to.equal("merge_into_existing");
    expect(updateOneStub.calledOnce).to.be.true;
    const [filter, update] = updateOneStub.firstCall.args;
    expect(filter).to.deep.equal({ _id: "idExisting" });
    expect(update).to.deep.equal({ $inc: { stockDisponible: 5 } });
    expect(deleteManyStub.calledOnceWith({ _id: { $in: ["id1"] } })).to.be.true;
  });

  it("fusionne deux documents cassés résolvant vers la même nouvelle ref sans doublon existant", async () => {
    mockBrokenDocs([
      { _id: "id1", ref: "KIT A", libelle: "KIT A", type: "kit", stockDisponible: 3 },
      { _id: "id2", ref: "KIT B", libelle: "KIT B", type: "kit", stockDisponible: 2 },
    ]);
    mockCandidateNumCmds({ "KIT A": [100], "KIT B": [200] });
    getDossierDetailStub.callsFake(async ({ commande }) => {
      if (commande === "100") {
        return { profileReferences: [], kitPosesReferences: [{ reference: "94900001", libelle: "KIT A" }] };
      }
      return { profileReferences: [], kitPosesReferences: [{ reference: "94900001", libelle: "KIT B" }] };
    });

    const result = await reconcileStockProfileReferences();

    expect(result.actions).to.have.lengthOf(1);
    expect(result.actions[0].type).to.equal("update_and_merge_duplicates");
    expect(updateOneStub.calledOnce).to.be.true;
    const [filter, update] = updateOneStub.firstCall.args;
    expect(filter).to.deep.equal({ _id: "id1" });
    expect(update.$inc).to.deep.equal({ stockDisponible: 2 });
    expect(deleteManyStub.calledOnceWith({ _id: { $in: ["id2"] } })).to.be.true;
  });

  it("ignore une commande si getDossierDetail échoue, sans interrompre les suivantes", async () => {
    mockBrokenDocs([
      { _id: "id1", ref: "CORNIERE PLATE 255cm", libelle: "CORNIERE PLATE 255cm", type: "profil", stockDisponible: 0 },
    ]);
    mockCandidateNumCmds({ "CORNIERE PLATE 255cm": [100, 200] });
    getDossierDetailStub.onFirstCall().rejects(new Error("ODBC indisponible"));
    getDossierDetailStub.onSecondCall().resolves({
      profileReferences: [
        { reference: "94911234", articleReference: "94911234", modele: "CORNIERE PLATE", libelle: "CORNIERE PLATE 255cm" },
      ],
      kitPosesReferences: [],
    });

    const result = await reconcileStockProfileReferences();

    expect(result.resolus).to.equal(1);
    expect(getDossierDetailStub.calledTwice).to.be.true;
  });

  it("signale un document non résolu si Gamesys ne retourne toujours pas de référence numérique", async () => {
    mockBrokenDocs([
      { _id: "id1", ref: "CORNIERE PLATE 255cm", libelle: "CORNIERE PLATE 255cm", type: "profil", stockDisponible: 0 },
    ]);
    mockCandidateNumCmds({ "CORNIERE PLATE 255cm": [100] });
    getDossierDetailStub.resolves({
      profileReferences: [{ libelle: "CORNIERE PLATE 255cm" }],
      kitPosesReferences: [],
    });

    const result = await reconcileStockProfileReferences();

    expect(result.nonResolus).to.equal(1);
    expect(result.unresolved[0].raison).to.match(/100/);
    expect(updateOneStub.called).to.be.false;
  });

  it("en dry-run, calcule les actions sans rien écrire", async () => {
    mockBrokenDocs([
      { _id: "id1", ref: "CORNIERE PLATE 255cm", libelle: "CORNIERE PLATE 255cm", type: "profil", stockDisponible: 0 },
    ]);
    mockCandidateNumCmds({ "CORNIERE PLATE 255cm": [166279] });
    getDossierDetailStub.resolves({
      profileReferences: [
        { reference: "94911234", articleReference: "94911234", modele: "CORNIERE PLATE", libelle: "CORNIERE PLATE 255cm" },
      ],
      kitPosesReferences: [],
    });

    const result = await reconcileStockProfileReferences({ dryRun: true });

    expect(result.resolus).to.equal(1);
    expect(result.actions).to.have.lengthOf(1);
    expect(updateOneStub.called).to.be.false;
    expect(deleteManyStub.called).to.be.false;
  });

  it("exclut un document explicitement désigné (mal classé comme profil) sans tenter de le résoudre", async () => {
    mockBrokenDocs([
      {
        _id: "idKit",
        ref: "Kit box échantillon avec cornière",
        libelle: "Kit box échantillon avec cornière",
        type: "profil",
        stockDisponible: 0,
      },
    ]);

    const result = await reconcileStockProfileReferences({ excludeLibelles: ["Kit box échantillon avec cornière"] });

    expect(consommationFindStub.called).to.be.false;
    expect(getDossierDetailStub.called).to.be.false;
    expect(result.totalCasses).to.equal(1);
    expect(result.resolus).to.equal(0);
    expect(result.nonResolus).to.equal(1);
    expect(result.unresolved[0].raison).to.match(/exclu/i);
  });

  it("recherche les commandes sources par libellé et type, jamais par ref", async () => {
    mockBrokenDocs([
      { _id: "id1", ref: "CORNIERE PLATE 255cm", libelle: "CORNIERE PLATE 255cm", type: "profil", stockDisponible: 0 },
    ]);
    mockCandidateNumCmds({ "CORNIERE PLATE 255cm": [166279] });
    getDossierDetailStub.resolves({ profileReferences: [], kitPosesReferences: [] });

    await reconcileStockProfileReferences();

    expect(consommationFindStub.calledOnce).to.be.true;
    const [filter, projection] = consommationFindStub.firstCall.args;
    expect(filter).to.deep.equal({ "articles.libelle": "CORNIERE PLATE 255cm", "articles.type": "profil" });
    expect(projection).to.deep.equal({ numCmd: 1, _id: 0 });
  });
});
