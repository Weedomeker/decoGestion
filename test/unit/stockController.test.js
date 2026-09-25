const { expect } = require("chai");
const sinon = require("sinon");
const Stocks = require("../../server/src/models/Stocks");
const { getStock } = require("../../server/src/controllers/stockController");

// Stub Stocks.findOne pour isoler le controller de la DB
describe("stockController.getStock()", () => {
  let findOneStub;
  let res;

  beforeEach(() => {
    findOneStub = sinon.stub(Stocks, "findOne");

    res = {
      statusCode: null,
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
  });

  afterEach(() => {
    sinon.restore();
  });

  it("répond 400 si ref est absent du body", async () => {
    await getStock({ body: {} }, res);

    expect(res.statusCode).to.equal(400);
    expect(res.body).to.deep.equal({ error: "Ref required" });
    expect(findOneStub.called).to.be.false;
  });

  it("répond 200 avec le stock quand la référence est trouvée", async () => {
    const mockStock = {
      visuel: "HOKUSAID-100210.pdf",
      ref: "HOKUSAID-100210",
      format: "100x210",
      finition: "mat",
      ex: 2,
    };
    findOneStub.resolves(mockStock);

    await getStock({ body: { ref: "HOKUSAID-100210" } }, res);

    expect(res.statusCode).to.equal(200);
    expect(res.body).to.deep.equal({ stock: mockStock });
    expect(findOneStub.calledOnceWith({ ref: "HOKUSAID-100210" })).to.be.true;
  });

  it("répond 404 quand la référence n'est pas en stock", async () => {
    findOneStub.resolves(null);

    await getStock({ body: { ref: "REF-INEXISTANTE" } }, res);

    expect(res.statusCode).to.equal(404);
    expect(res.body).to.deep.equal({ error: "Stock not found" });
  });

  it("répond 500 si Stocks.findOne lève une exception", async () => {
    findOneStub.rejects(new Error("DB error"));

    await getStock({ body: { ref: "HOKUSAID-100210" } }, res);

    expect(res.statusCode).to.equal(500);
    expect(res.body).to.deep.equal({ error: "Internal server error" });
  });
});
