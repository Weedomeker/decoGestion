const { expect } = require("chai");
const sinon = require("sinon");
const modelDeco = require("../../server/src/models/Deco");
const refModels = require("../../server/src/services/refModels");
const { getSuggestions, lookupVisuel, getRefVisuels } = require("../../server/src/controllers/jobsController");
const { regexLitterale } = require("../../server/src/utils/rechercheTexte");

// La saisie de l'utilisateur part dans Mongo comme texte littéral : « ( » ne doit plus provoquer
// d'erreur 500, ni « .* » ramener toute la collection.
function fausseReponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

describe("regexLitterale", () => {
  it("cherche la saisie telle quelle, sans tenir compte de la casse", () => {
    expect(regexLitterale("a+(b").test("X A+(B")).to.equal(true);
    expect(regexLitterale(".*").test("LM")).to.equal(false);
  });

  it("renvoie null pour un texte vide ou un paramètre répété", () => {
    expect(regexLitterale("  ")).to.equal(null);
    expect(regexLitterale(undefined)).to.equal(null);
    expect(regexLitterale(["a", "b"])).to.equal(null);
  });
});

describe("jobsController — recherche par texte libre", () => {
  afterEach(() => sinon.restore());

  it("getSuggestions échappe la saisie", async () => {
    const distinct = sinon.stub(modelDeco, "distinct").resolves(["CAFE (1)"]);
    const res = fausseReponse();
    await getSuggestions({ query: { field: "visuel", q: "(" } }, res);

    expect(res.statusCode).to.equal(200);
    const filtre = distinct.firstCall.args[1].deco;
    expect(filtre).to.be.instanceOf(RegExp);
    expect(filtre.test("CAFE (1)")).to.equal(true);
  });

  it("getSuggestions sans saisie ne filtre pas", async () => {
    const distinct = sinon.stub(modelDeco, "distinct").resolves([]);
    await getSuggestions({ query: { field: "ville", q: ["a", "b"] } }, fausseReponse());
    expect(distinct.firstCall.args[1]).to.deep.equal({});
  });

  it("lookupVisuel échappe le visuel et le format", async () => {
    const sort = sinon.stub().resolves({ ref: "123", mag: "AMIENS", format: "125x260", client: "LM" });
    const findOne = sinon.stub(modelDeco, "findOne").returns({ sort });
    const res = fausseReponse();
    await lookupVisuel({ query: { visuel: "MOSAIQUE (BIS)", format: "125x260" } }, res);

    expect(res.body.ref).to.equal("123");
    const { deco, format } = findOne.firstCall.args[0];
    expect(deco.test("CRED MOSAIQUE (BIS) MAT")).to.equal(true);
    expect(format.test("125x260")).to.equal(true);
  });

  it("lookupVisuel refuse un visuel absent ou répété en 400", async () => {
    const res = fausseReponse();
    await lookupVisuel({ query: { visuel: ["a", "b"] } }, res);
    expect(res.statusCode).to.equal(400);
  });

  it("getRefVisuels échappe la saisie sur chaque catalogue", async () => {
    const stubs = Object.values(refModels).map((m) => sinon.stub(m, "distinct").resolves(["A+B"]));
    const res = fausseReponse();
    await getRefVisuels({ query: { q: "a+b" } }, res);

    expect(res.body).to.deep.equal(["A+B"]);
    for (const stub of stubs) expect(stub.firstCall.args[1].model.test("A+B")).to.equal(true);
  });
});
