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
      dateJob: new Date("2026-06-26"),
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
    for (const client of ["LM", "CASTO", "BRICO", "ECOM"]) {
      const doc = await ConsommationCommande.create({
        numCmd: 1,
        client,
        articles: [],
      });
      expect(doc.client).to.equal(client);
    }
  });

  it("refuse un client invalide", async () => {
    let err;
    try {
      await ConsommationCommande.create({ numCmd: 1, client: "INCONNU", articles: [] });
    } catch (e) { err = e; }
    expect(err).to.exist;
    expect(err.name).to.equal("ValidationError");
  });

  it("le même numCmd peut avoir plusieurs documents (pas d'unicité)", async () => {
    await ConsommationCommande.create({ numCmd: 99999, client: "LM", articles: [] });
    await ConsommationCommande.create({ numCmd: 99999, client: "LM", articles: [] });

    const count = await ConsommationCommande.countDocuments({ numCmd: 99999 });
    expect(count).to.equal(2);
  });

  it("dateJob prend la valeur courante par défaut", async () => {
    const before = new Date();
    const doc = await ConsommationCommande.create({ numCmd: 1, client: "LM", articles: [] });
    const after = new Date();

    expect(doc.dateJob.getTime()).to.be.at.least(before.getTime());
    expect(doc.dateJob.getTime()).to.be.at.most(after.getTime());
  });
});
