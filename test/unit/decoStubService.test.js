const { expect } = require("chai");
const sinon = require("sinon");
const { claimStubOrCreate } = require("../../server/src/services/decoStubService");

describe("decoStubService.claimStubOrCreate()", () => {
  it("réclame le stub existant (gamesysStub:true) et repasse gamesysStub à false", async () => {
    const claimed = { _id: "stub1", numCmd: 167648, gamesysStub: false };
    const findOneAndUpdateStub = sinon.stub().resolves(claimed);
    const saveStub = sinon.stub();
    function FakeDeco(data) {
      Object.assign(this, data);
      this.save = saveStub;
    }
    FakeDeco.findOneAndUpdate = findOneAndUpdateStub;

    const data = { deco: "MOSAIQUE", ref: "ABC123", ex: 2 };
    const result = await claimStubOrCreate(FakeDeco, 167648, data);

    expect(result).to.equal(claimed);
    expect(
      findOneAndUpdateStub.calledOnceWith(
        { numCmd: 167648, gamesysStub: true },
        { $set: { ...data, gamesysStub: false } },
        { new: true },
      ),
    ).to.be.true;
    expect(saveStub.called).to.be.false;
  });

  it("crée un nouveau document quand aucun stub n'existe pour ce numCmd", async () => {
    const findOneAndUpdateStub = sinon.stub().resolves(null);
    const saveStub = sinon.stub().resolves();
    function FakeDeco(data) {
      Object.assign(this, data);
      this.save = saveStub;
    }
    FakeDeco.findOneAndUpdate = findOneAndUpdateStub;

    const data = { deco: "MOSAIQUE", numCmd: 167648 };
    const result = await claimStubOrCreate(FakeDeco, 167648, data);

    expect(findOneAndUpdateStub.calledOnce).to.be.true;
    expect(saveStub.calledOnce).to.be.true;
    expect(result.deco).to.equal("MOSAIQUE");
  });

  it("crée directement sans interroger findOneAndUpdate quand numCmd est absent (falsy)", async () => {
    const findOneAndUpdateStub = sinon.stub();
    const saveStub = sinon.stub().resolves();
    function FakeDeco(data) {
      Object.assign(this, data);
      this.save = saveStub;
    }
    FakeDeco.findOneAndUpdate = findOneAndUpdateStub;

    await claimStubOrCreate(FakeDeco, 0, { deco: "SAISIE_MANUELLE" });

    expect(findOneAndUpdateStub.called).to.be.false;
    expect(saveStub.calledOnce).to.be.true;
  });
});
