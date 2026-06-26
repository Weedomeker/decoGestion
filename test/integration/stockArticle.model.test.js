const { expect } = require("chai");
const { connect, disconnect, clearCollections } = require("../helpers/mongoTestHelper");
const StockArticle = require("../../server/src/models/StockArticle");

describe("Modèle StockArticle (intégration)", () => {
  before(async () => { await connect(); });
  after(async () => { await disconnect(); });
  afterEach(async () => { await clearCollections(); });

  it("crée un article avec les champs requis", async () => {
    const doc = await StockArticle.create({
      ref: "KIT001",
      type: "kit",
      libelle: "KIT DE POSE",
    });
    expect(doc.ref).to.equal("KIT001");
    expect(doc.type).to.equal("kit");
    expect(doc.stockDisponible).to.equal(0);
  });

  it("refuse un document sans ref", async () => {
    let err;
    try { await StockArticle.create({ type: "profil" }); }
    catch (e) { err = e; }
    expect(err).to.exist;
    expect(err.name).to.equal("ValidationError");
  });

  it("refuse un type invalide", async () => {
    let err;
    try { await StockArticle.create({ ref: "X", type: "inconnu" }); }
    catch (e) { err = e; }
    expect(err).to.exist;
    expect(err.name).to.equal("ValidationError");
  });

  it("upsert $setOnInsert ne modifie pas un article existant", async () => {
    await StockArticle.create({ ref: "P001", type: "profil", libelle: "PROFIL ALU", stockDisponible: 10 });

    await StockArticle.findOneAndUpdate(
      { ref: "P001" },
      { $setOnInsert: { ref: "P001", type: "profil", libelle: "VALEUR IGNOREE", stockDisponible: 0 } },
      { upsert: true, new: true }
    );

    const found = await StockArticle.findOne({ ref: "P001" });
    expect(found.libelle).to.equal("PROFIL ALU");
    expect(found.stockDisponible).to.equal(10);
  });

  it("upsert $setOnInsert crée un nouvel article s'il est absent", async () => {
    await StockArticle.findOneAndUpdate(
      { ref: "NOUVEAU" },
      { $setOnInsert: { ref: "NOUVEAU", type: "kit", libelle: "NOUVEAU KIT" } },
      { upsert: true }
    );

    const found = await StockArticle.findOne({ ref: "NOUVEAU" });
    expect(found).to.not.be.null;
    expect(found.libelle).to.equal("NOUVEAU KIT");
    expect(found.stockDisponible).to.equal(0);
  });
});
