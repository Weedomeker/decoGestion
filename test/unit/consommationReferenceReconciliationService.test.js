const { expect } = require("chai");
const sinon = require("sinon");

const dossierService = require("../../server/src/gamesys/services/dossierService");
const ConsommationCommande = require("../../server/src/models/ConsommationCommande");
const {
  reconcileConsommationReferences,
} = require("../../server/src/services/consommationReferenceReconciliationService");

describe("consommationReferenceReconciliationService.reconcileConsommationReferences()", () => {
  let aggregateStub;
  let getDossierDetailStub;
  let updateOneStub;

  beforeEach(() => {
    aggregateStub = sinon.stub(ConsommationCommande, "aggregate");
    getDossierDetailStub = sinon.stub(dossierService, "getDossierDetail");
    updateOneStub = sinon.stub(ConsommationCommande, "updateOne").resolves({});
  });

  afterEach(() => {
    sinon.restore();
  });

  it("ne fait rien quand aucune commande n'a de référence non numérique", async () => {
    aggregateStub.resolves([]);

    const result = await reconcileConsommationReferences();

    expect(result).to.deep.equal({ commandesAnalysees: 0, articlesCorrigeables: 0, articlesCorriges: 0, details: [] });
    expect(getDossierDetailStub.called).to.be.false;
    expect(updateOneStub.called).to.be.false;
  });

  it("corrige une référence de cornière désormais retrouvée via Gamesys", async () => {
    aggregateStub.resolves([{ numCmd: 166279 }]);
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
      "articles.libelle": "CORNIERE PLATE 255cm",
      "articles.ref": { $not: /^\d+$/ },
    });
    expect(update).to.deep.equal({ $set: { "articles.$.ref": "94911234" } });
  });

  it("en dry-run, détecte les corrections possibles sans rien écrire", async () => {
    aggregateStub.resolves([{ numCmd: 166279 }]);
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
    aggregateStub.resolves([{ numCmd: 166279 }]);
    getDossierDetailStub.resolves({
      profileReferences: [{ libelle: "CORNIERE PLATE 255cm" }],
      kitPosesReferences: [],
    });

    const result = await reconcileConsommationReferences();

    expect(result.articlesCorrigeables).to.equal(0);
    expect(updateOneStub.called).to.be.false;
  });

  it("ignore une commande si getDossierDetail échoue, sans interrompre les suivantes", async () => {
    aggregateStub.resolves([{ numCmd: 100511 }, { numCmd: 166279 }]);
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
