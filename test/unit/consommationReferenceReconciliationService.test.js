const { expect } = require("chai");
const sinon = require("sinon");

const dossierService = require("../../server/src/gamesys/services/dossierService");
const ConsommationCommande = require("../../server/src/models/ConsommationCommande");
const {
  reconcileConsommationReferences,
} = require("../../server/src/services/consommationReferenceReconciliationService");

describe("consommationReferenceReconciliationService.reconcileConsommationReferences()", () => {
  let findStub;
  let getDossierDetailStub;
  let updateOneStub;

  function mockCommandesCassees(docs) {
    findStub.returns({ lean: sinon.stub().resolves(docs) });
  }

  beforeEach(() => {
    findStub = sinon.stub(ConsommationCommande, "find").returns({ lean: sinon.stub().resolves([]) });
    getDossierDetailStub = sinon.stub(dossierService, "getDossierDetail");
    updateOneStub = sinon.stub(ConsommationCommande, "updateOne").resolves({ modifiedCount: 1 });
  });

  afterEach(() => {
    sinon.restore();
  });

  it("ne fait rien quand aucune commande n'a de référence non numérique", async () => {
    mockCommandesCassees([]);

    const result = await reconcileConsommationReferences();

    expect(result).to.deep.equal({ commandesAnalysees: 0, articlesCorrigeables: 0, articlesCorriges: 0, details: [] });
    expect(getDossierDetailStub.called).to.be.false;
    expect(updateOneStub.called).to.be.false;
  });

  it("détecte une commande via $elemMatch (y compris quand d'autres articles du même document ont déjà une ref numérique)", async () => {
    mockCommandesCassees([{ numCmd: 166279 }]);
    getDossierDetailStub.resolves({ profileReferences: [], kitPosesReferences: [] });

    await reconcileConsommationReferences();

    expect(findStub.calledOnce).to.be.true;
    const [filter, projection] = findStub.firstCall.args;
    expect(filter).to.deep.equal({ articles: { $elemMatch: { ref: { $not: /^\d+$/ } } } });
    expect(projection).to.deep.equal({ numCmd: 1, _id: 0 });
  });

  it("corrige une référence de cornière désormais retrouvée via Gamesys", async () => {
    mockCommandesCassees([{ numCmd: 166279 }]);
    getDossierDetailStub.resolves({
      profileReferences: [
        { reference: "94911234", articleReference: "94911234", modele: "CORNIERE PLATE", libelle: "CORNIERE PLATE 255cm" },
      ],
      kitPosesReferences: [],
    });

    const result = await reconcileConsommationReferences();

    expect(result.commandesAnalysees).to.equal(1);
    expect(result.articlesCorriges).to.equal(1);
    expect(updateOneStub.calledOnce).to.be.true;
    const [filter, update] = updateOneStub.firstCall.args;
    expect(filter).to.deep.equal({
      numCmd: 166279,
      articles: { $elemMatch: { libelle: "CORNIERE PLATE 255cm", ref: { $not: /^\d+$/ } } },
    });
    expect(update).to.deep.equal({ $set: { "articles.$.ref": "94911234" } });
  });

  it("ne compte pas une correction si l'écriture ne modifie aucun élément (positionnel $ n'a rien trouvé)", async () => {
    mockCommandesCassees([{ numCmd: 166279 }]);
    getDossierDetailStub.resolves({
      profileReferences: [
        { reference: "94911234", articleReference: "94911234", modele: "CORNIERE PLATE", libelle: "CORNIERE PLATE 255cm" },
      ],
      kitPosesReferences: [],
    });
    updateOneStub.resolves({ modifiedCount: 0 });

    const result = await reconcileConsommationReferences();

    expect(result.articlesCorrigeables).to.equal(1);
    expect(result.articlesCorriges).to.equal(0);
  });

  it("en dry-run, détecte les corrections possibles sans rien écrire", async () => {
    mockCommandesCassees([{ numCmd: 166279 }]);
    getDossierDetailStub.resolves({
      profileReferences: [
        { reference: "94911234", articleReference: "94911234", modele: "CORNIERE PLATE", libelle: "CORNIERE PLATE 255cm" },
      ],
      kitPosesReferences: [],
    });

    const result = await reconcileConsommationReferences({ dryRun: true });

    expect(result.articlesCorrigeables).to.equal(1);
    expect(result.articlesCorriges).to.equal(0);
    expect(updateOneStub.called).to.be.false;
  });

  it("n'applique aucune correction si Gamesys ne retrouve toujours pas de référence numérique", async () => {
    mockCommandesCassees([{ numCmd: 166279 }]);
    getDossierDetailStub.resolves({
      profileReferences: [{ libelle: "CORNIERE PLATE 255cm" }],
      kitPosesReferences: [],
    });

    const result = await reconcileConsommationReferences();

    expect(result.articlesCorrigeables).to.equal(0);
    expect(updateOneStub.called).to.be.false;
  });

  it("exclut un libellé explicitement désigné (mal classé comme profil) sans le corriger", async () => {
    mockCommandesCassees([{ numCmd: 166279 }]);
    getDossierDetailStub.resolves({
      profileReferences: [
        {
          reference: "94964038",
          articleReference: "94964038",
          modele: "94964038",
          libelle: "Kit box à échantillon avec cornière",
        },
      ],
      kitPosesReferences: [],
    });

    const result = await reconcileConsommationReferences({
      excludeLibelles: ["Kit box à échantillon avec cornière"],
    });

    expect(result.articlesCorrigeables).to.equal(0);
    expect(updateOneStub.called).to.be.false;
  });

  it("ignore une commande si getDossierDetail échoue, sans interrompre les suivantes", async () => {
    mockCommandesCassees([{ numCmd: 100511 }, { numCmd: 166279 }]);
    getDossierDetailStub.onFirstCall().rejects(new Error("ODBC indisponible"));
    getDossierDetailStub.onSecondCall().resolves({
      profileReferences: [
        { reference: "94911234", articleReference: "94911234", modele: "CORNIERE PLATE", libelle: "CORNIERE PLATE 255cm" },
      ],
      kitPosesReferences: [],
    });

    const result = await reconcileConsommationReferences();

    expect(result.commandesAnalysees).to.equal(2);
    expect(result.articlesCorriges).to.equal(1);
  });
});
