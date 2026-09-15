const { expect } = require("chai");
const { connect, disconnect, clearCollections } = require("../helpers/mongoTestHelper");
const StockProfile = require("../../server/src/models/StockProfile");

describe("Modèle StockProfile (intégration)", () => {
  before(async () => { await connect(); });
  after(async () => { await disconnect(); });
  afterEach(async () => { await clearCollections(); });

  it("crée un article avec les champs requis", async () => {
    const doc = await StockProfile.create({
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
    try { await StockProfile.create({ type: "profil" }); }
    catch (e) { err = e; }
    expect(err).to.exist;
    expect(err.name).to.equal("ValidationError");
  });

  it("refuse un type invalide", async () => {
    let err;
    try { await StockProfile.create({ ref: "X", type: "inconnu" }); }
    catch (e) { err = e; }
    expect(err).to.exist;
    expect(err.name).to.equal("ValidationError");
  });

  it("upsert $setOnInsert ne modifie pas un article existant", async () => {
    await StockProfile.create({ ref: "P001", type: "profil", libelle: "PROFIL ALU", stockDisponible: 10 });

    await StockProfile.findOneAndUpdate(
      { ref: "P001" },
      { $setOnInsert: { ref: "P001", type: "profil", libelle: "VALEUR IGNOREE", stockDisponible: 0 } },
      { upsert: true, new: true }
    );

    const found = await StockProfile.findOne({ ref: "P001" });
    expect(found.libelle).to.equal("PROFIL ALU");
    expect(found.stockDisponible).to.equal(10);
  });

  it("upsert $setOnInsert crée un nouvel article s'il est absent", async () => {
    await StockProfile.findOneAndUpdate(
      { ref: "NOUVEAU" },
      { $setOnInsert: { ref: "NOUVEAU", type: "kit", libelle: "NOUVEAU KIT" } },
      { upsert: true }
    );

    const found = await StockProfile.findOne({ ref: "NOUVEAU" });
    expect(found).to.not.be.null;
    expect(found.libelle).to.equal("NOUVEAU KIT");
    expect(found.stockDisponible).to.equal(0);
  });

  it("stocke un tableau d'aliases vide par défaut", async () => {
    const doc = await StockProfile.create({ ref: "94953589", type: "profil", libelle: "PROFILE Alu Mat" });
    expect(doc.aliases).to.deep.equal([]);
  });

  it("stocke des aliases et permet de chercher par alias", async () => {
    await StockProfile.create({
      ref: "94953589",
      type: "profil",
      libelle: "PROFILE Alu Mat - A - Finition - 255cm",
      aliases: ["MU-PROFMAT255A", "PROFMAT255A"],
    });
    const found = await StockProfile.findOne({ aliases: "MU-PROFMAT255A" });
    expect(found).to.not.be.null;
    expect(found.ref).to.equal("94953589");
  });

  it("accepte les aliases dupliqués (déduplication non gérée par le schéma)", async () => {
    const doc = await StockProfile.create({
      ref: "94953589",
      type: "profil",
      libelle: "PROFILE Alu Mat",
      aliases: ["MU-PROFMAT255A", "MU-PROFMAT255A"],
    });
    // Mongoose ne déduplique pas par défaut — on vérifie juste que le doc est créé
    // (la déduplication est gérée par le script de migration, pas par le schéma)
    expect(doc.aliases).to.have.length(2);
  });
});
