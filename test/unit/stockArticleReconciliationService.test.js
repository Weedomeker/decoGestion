const { expect } = require("chai");
const sinon = require("sinon");
const StockProfile = require("../../server/src/models/StockProfile");
const ConsommationCommande = require("../../server/src/models/ConsommationCommande");
const { reconcileStockArticlesFromConsommations } = require("../../server/src/services/stockArticleReconciliationService");

describe("stockArticleReconciliationService.reconcileStockArticlesFromConsommations()", () => {
  let aggregateStub;
  let distinctStub;
  let findOneAndUpdateStub;

  beforeEach(() => {
    aggregateStub = sinon.stub(ConsommationCommande, "aggregate");
    distinctStub = sinon.stub(StockProfile, "distinct");
    findOneAndUpdateStub = sinon.stub(StockProfile, "findOneAndUpdate").resolves({});
  });

  afterEach(() => sinon.restore());

  it("ne crée pas de StockProfile pour une ref qui est un alias d'un canonique", async () => {
    // La commande contient un article avec ref=PROFMAT255A (alias d'un canonique)
    aggregateStub.resolves([
      { _id: "PROFMAT255A", type: "profil", libelle: "PROFILE Alu Mat - A - Finition - 255cm" },
    ]);
    // StockProfile.distinct("ref") ne contient pas PROFMAT255A (le doc canonique a ref=94953589)
    // StockProfile.distinct("aliases") contient PROFMAT255A
    distinctStub.withArgs("ref").resolves(["94953589"]);
    distinctStub.withArgs("aliases").resolves(["PROFMAT255A", "MU-PROFMAT255A"]);

    const result = await reconcileStockArticlesFromConsommations({ dryRun: false });

    expect(findOneAndUpdateStub.called).to.be.false;
    expect(result.orphelinsDetectes).to.equal(0);
  });

  it("crée bien un StockProfile pour une ref absente des refs ET des aliases", async () => {
    aggregateStub.resolves([
      { _id: "REFNOUVELLE", type: "profil", libelle: "PROFILE NOUVEAU" },
    ]);
    distinctStub.withArgs("ref").resolves(["94953589"]);
    distinctStub.withArgs("aliases").resolves(["PROFMAT255A"]);

    const result = await reconcileStockArticlesFromConsommations({ dryRun: false });

    expect(findOneAndUpdateStub.calledOnce).to.be.true;
    expect(result.orphelinsDetectes).to.equal(1);
    expect(result.crees).to.equal(1);
  });

  it("en dry-run, compte les orphelins sans créer", async () => {
    aggregateStub.resolves([
      { _id: "REFNOUVELLE", type: "profil", libelle: "PROFILE NOUVEAU" },
    ]);
    distinctStub.withArgs("ref").resolves([]);
    distinctStub.withArgs("aliases").resolves([]);

    const result = await reconcileStockArticlesFromConsommations({ dryRun: true });

    expect(findOneAndUpdateStub.called).to.be.false;
    expect(result.orphelinsDetectes).to.equal(1);
    expect(result.crees).to.equal(0);
  });
});
