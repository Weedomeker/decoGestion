const { expect } = require("chai");
const sinon = require("sinon");

// Stub Stocks.findOne avant de requérir findStock
const Stocks = require("../../server/src/models/Stocks");
const findStock = require("../../server/src/findStock");

describe("findStock()", () => {
  let findOneStub;

  beforeEach(() => {
    findOneStub = sinon.stub(Stocks, "findOne");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("retourne le stock quand la référence existe", async () => {
    const mockStock = {
      visuel: "HOKUSAID-100210.pdf",
      ref: "HOKUSAID-100210",
      format: "100x210",
      finition: "mat",
      ex: 3,
    };
    findOneStub.resolves(mockStock);

    const result = await findStock("HOKUSAID-100210");

    expect(findOneStub.calledOnceWith({ ref: "HOKUSAID-100210" })).to.be.true;
    expect(result).to.deep.equal(mockStock);
  });

  it("retourne undefined quand la référence n'est pas en stock", async () => {
    findOneStub.resolves(null);

    const result = await findStock("REF-INEXISTANTE");

    expect(result).to.be.undefined;
  });

  it("retourne undefined quand ref est null", async () => {
    findOneStub.resolves(null);

    const result = await findStock(null);

    expect(result).to.be.undefined;
  });

  it("retourne le stock avec tous ses champs", async () => {
    const mockStock = {
      visuel: "U565-100210.pdf",
      ref: "U565-100210",
      format: "100x210",
      finition: "",
      ex: 1,
    };
    findOneStub.resolves(mockStock);

    const result = await findStock("U565-100210");

    expect(result).to.have.property("visuel", "U565-100210.pdf");
    expect(result).to.have.property("ref", "U565-100210");
    expect(result).to.have.property("format", "100x210");
    expect(result).to.have.property("ex", 1);
  });
});
