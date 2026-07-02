const { expect } = require("chai");
const { connect, disconnect, clearCollections } = require("../helpers/mongoTestHelper");
const ConsommationCommande = require("../../server/src/models/ConsommationCommande");

describe("Modèle ConsommationCommande (intégration)", () => {
  before(async () => { await connect(); });
  after(async () => { await disconnect(); });
  afterEach(async () => { await clearCollections(); });

  it("crée une consommation avec articles", async () => {
    const doc = await ConsommationCommande.create({
      numCmd: 164629,
      client: "LM",
      dateCommande: new Date("2026-06-26"),
      articles: [
        { ref: "P001", type: "profil", libelle: "PROFIL BLANC 255", quantite: 2 },
        { ref: "KIT001", type: "kit", libelle: "KIT DE POSE", quantite: 1 },
      ],
    });

    expect(doc.numCmd).to.equal(164629);
    expect(doc.articles).to.have.length(2);
    expect(doc.articles[0].ref).to.equal("P001");
    expect(doc.articles[1].quantite).to.equal(1);
  });

  it("accepte un client valide", async () => {
    let numCmd = 2000;
    for (const client of ["LM", "CASTO", "BRICO", "ECOM"]) {
      const doc = await ConsommationCommande.create({
        numCmd: numCmd++,
        client,
        articles: [],
      });
      expect(doc.client).to.equal(client);
    }
  });

  it("refuse un client invalide", async () => {
    let err;
    try {
      await ConsommationCommande.create({ numCmd: 3000, client: "INCONNU", articles: [] });
    } catch (e) { err = e; }
    expect(err).to.exist;
    expect(err.name).to.equal("ValidationError");
  });

  it("refuse un numCmd en doublon", async () => {
    await ConsommationCommande.create({ numCmd: 99999, client: "LM", articles: [] });

    let err;
    try {
      await ConsommationCommande.create({ numCmd: 99999, client: "LM", articles: [] });
    } catch (e) { err = e; }

    expect(err).to.exist;
    expect(err.code).to.equal(11000);

    const count = await ConsommationCommande.countDocuments({ numCmd: 99999 });
    expect(count).to.equal(1);
  });

  it("createdAt prend la valeur courante par défaut (timestamps)", async () => {
    const before = new Date();
    const doc = await ConsommationCommande.create({ numCmd: 4000, client: "LM", articles: [] });
    const after = new Date();

    expect(doc.createdAt.getTime()).to.be.at.least(before.getTime());
    expect(doc.createdAt.getTime()).to.be.at.most(after.getTime());
  });
});
