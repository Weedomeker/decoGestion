const { expect } = require("chai");
const sinon = require("sinon");

const ConsommationCommande = require("../../server/src/models/ConsommationCommande");
const StockArticle = require("../../server/src/models/StockArticle");
const { reconcileStockArticlesFromConsommations } = require("../../server/src/services/stockArticleReconciliationService");

describe("stockArticleReconciliationService.reconcileStockArticlesFromConsommations()", () => {
  let aggregateStub;
  let distinctStub;
  let upsertStub;

  beforeEach(() => {
    aggregateStub = sinon.stub(ConsommationCommande, "aggregate");
    distinctStub = sinon.stub(StockArticle, "distinct");
    upsertStub = sinon.stub(StockArticle, "findOneAndUpdate").resolves({});
  });

  afterEach(() => {
    sinon.restore();
  });

  it("ne crée rien quand toutes les refs consommées sont déjà au catalogue", async () => {
    aggregateStub.resolves([{ _id: "94953593", type: "kit", libelle: "KIT DE POSE" }]);
    distinctStub.resolves(["94953593"]);

    const result = await reconcileStockArticlesFromConsommations();

    expect(result).to.deep.equal({ orphelinsDetectes: 0, crees: 0 });
    expect(upsertStub.called).to.be.false;
  });

  it("crée un StockArticle pour chaque ref orpheline", async () => {
    aggregateStub.resolves([
      { _id: "94953593", type: "kit", libelle: "KIT DE POSE" },
      { _id: "Kit de pose pour 1 panneau", type: "kit", libelle: "Kit de pose pour 1 panneau" },
    ]);
    distinctStub.resolves(["94953593"]);

    const result = await reconcileStockArticlesFromConsommations();

    expect(result).to.deep.equal({ orphelinsDetectes: 1, crees: 1 });
    expect(upsertStub.calledOnce).to.be.true;
    const [filter, update] = upsertStub.firstCall.args;
    expect(filter).to.deep.equal({ ref: "Kit de pose pour 1 panneau" });
    expect(update.$setOnInsert.type).to.equal("kit");
  });

  it("en mode dry-run, compte les orphelines sans rien créer", async () => {
    aggregateStub.resolves([{ _id: "REF-ORPHELINE", type: "profil", libelle: "PROFIL X" }]);
    distinctStub.resolves([]);

    const result = await reconcileStockArticlesFromConsommations({ dryRun: true });

    expect(result).to.deep.equal({ orphelinsDetectes: 1, crees: 0 });
    expect(upsertStub.called).to.be.false;
  });

  it("comptabilise les échecs de création sans interrompre les autres", async () => {
    aggregateStub.resolves([
      { _id: "REF-A", type: "profil", libelle: "PROFIL A" },
      { _id: "REF-B", type: "kit", libelle: "KIT B" },
    ]);
    distinctStub.resolves([]);
    upsertStub.onFirstCall().rejects(new Error("Mongo indisponible"));
    upsertStub.onSecondCall().resolves({});

    const result = await reconcileStockArticlesFromConsommations();

    expect(result).to.deep.equal({ orphelinsDetectes: 2, crees: 1 });
  });

  it("ignore les articles sans ref", async () => {
    aggregateStub.resolves([]);
    distinctStub.resolves([]);

    const result = await reconcileStockArticlesFromConsommations();

    expect(result).to.deep.equal({ orphelinsDetectes: 0, crees: 0 });
    const pipeline = aggregateStub.firstCall.args[0];
    expect(pipeline[1]).to.deep.equal({ $match: { "articles.ref": { $nin: [null, ""] } } });
  });
});
