const { expect } = require("chai");
const sinon = require("sinon");
const StockProfile = require("../../server/src/models/StockProfile");
const { getStockProfiles } = require("../../server/src/controllers/stockController");

describe("stockController.getStockProfiles()", () => {
  let findStub;

  function makeReq(query = {}) {
    return { query };
  }
  function makeRes() {
    const res = {};
    res.json = sinon.stub().returns(res);
    res.status = sinon.stub().returns(res);
    return res;
  }

  beforeEach(() => {
    findStub = sinon.stub(StockProfile, "find").returns({
      sort: sinon.stub().returnsThis(),
      limit: sinon.stub().returnsThis(),
      lean: sinon.stub().resolves([]),
    });
  });

  afterEach(() => sinon.restore());

  it("inclut aliases dans le filtre $or quand q est fourni", async () => {
    const req = makeReq({ q: "PROFMAT" });
    const res = makeRes();

    await getStockProfiles(req, res);

    const [filter] = findStub.firstCall.args;
    const orFields = (filter.$or || []).map((clause) => Object.keys(clause)[0]);
    expect(orFields).to.include("aliases");
  });

  it("n'ajoute pas de filtre $or quand q est absent", async () => {
    const req = makeReq({});
    const res = makeRes();

    await getStockProfiles(req, res);

    const [filter] = findStub.firstCall.args;
    expect(filter.$or).to.be.undefined;
  });

  it("filtre sur type quand type=profil", async () => {
    const req = makeReq({ type: "profil" });
    const res = makeRes();

    await getStockProfiles(req, res);

    const [filter] = findStub.firstCall.args;
    expect(filter.type).to.equal("profil");
  });
});
