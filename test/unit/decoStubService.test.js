const { expect } = require("chai");
const sinon = require("sinon");
const { claimStubOrCreate, computeSousDossiersPkOnly } = require("../../server/src/services/decoStubService");

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

describe("decoStubService.computeSousDossiersPkOnly()", () => {
  it("retient les sous-dossiers portant un profil ou un kit, exclut les sous-dossiers purement visuel (cas réel 166239)", () => {
    const sousDossiers = [
      { sousNumero: "00", profileReferences: [{ reference: "94964465" }], kitPosesReferences: [], visualReferences: [] },
      { sousNumero: "01", profileReferences: [], kitPosesReferences: [{ reference: "94953593" }], visualReferences: [] },
      { sousNumero: "02", profileReferences: [], kitPosesReferences: [], visualReferences: [{ reference: "94953000" }] },
    ];

    expect(computeSousDossiersPkOnly(sousDossiers)).to.have.members(["00", "01"]);
  });

  it("déduplique un sous-dossier portant à la fois un profil et un kit", () => {
    const sousDossiers = [
      { sousNumero: "00", profileReferences: [{ reference: "A" }], kitPosesReferences: [{ reference: "B" }] },
    ];

    expect(computeSousDossiersPkOnly(sousDossiers)).to.deep.equal(["00"]);
  });

  it("retourne undefined si aucun sous-dossier n'a de profil ni de kit", () => {
    const sousDossiers = [{ sousNumero: "00", profileReferences: [], kitPosesReferences: [], visualReferences: [{}] }];

    expect(computeSousDossiersPkOnly(sousDossiers)).to.be.undefined;
  });

  it("gère un tableau vide ou undefined", () => {
    expect(computeSousDossiersPkOnly([])).to.be.undefined;
    expect(computeSousDossiersPkOnly(undefined)).to.be.undefined;
  });
});
