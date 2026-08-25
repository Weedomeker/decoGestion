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
        // data.sousDossier absent (saisie manuelle) : ne réclame qu'un stub générique sans
        // sousDossier (jamais un stub d'un autre visuel de la même commande, cf. decoStubService.js).
        { numCmd: 167648, gamesysStub: true, sousDossier: { $in: [null, ""] } },
        { $set: { ...data, gamesysStub: false } },
        { new: true },
      ),
    ).to.be.true;
    expect(saveStub.called).to.be.false;
  });

  it("réclame précisément le stub du bon sousDossier quand le job le connaît (recherche dossier)", async () => {
    const claimed = { _id: "stub2", numCmd: 167648, sousDossier: "01", gamesysStub: false };
    const findOneAndUpdateStub = sinon.stub().resolves(claimed);
    function FakeDeco(data) {
      Object.assign(this, data);
      this.save = sinon.stub();
    }
    FakeDeco.findOneAndUpdate = findOneAndUpdateStub;

    const data = { deco: "MOSAIQUE", ref: "ABC123", sousDossier: "01" };
    const result = await claimStubOrCreate(FakeDeco, 167648, data);

    expect(result).to.equal(claimed);
    expect(
      findOneAndUpdateStub.calledOnceWith(
        { numCmd: 167648, gamesysStub: true, sousDossier: "01" },
        { $set: { ...data, gamesysStub: false } },
        { new: true },
      ),
    ).to.be.true;
  });

  it("réclame par ref le stub d'un sous-dossier quand le job ne connaît pas son sousDossier (repli)", async () => {
    const claimed = { _id: "stub3", numCmd: 167731, sousDossier: "07", ref: "94953664", gamesysStub: false };
    const findOneAndUpdateStub = sinon.stub();
    findOneAndUpdateStub
      .withArgs({ numCmd: 167731, gamesysStub: true, sousDossier: { $in: [null, ""] } })
      .resolves(null);
    findOneAndUpdateStub.withArgs({ numCmd: 167731, gamesysStub: true, ref: "94953664" }).resolves(claimed);
    function FakeDeco(data) {
      Object.assign(this, data);
      this.save = sinon.stub();
    }
    FakeDeco.findOneAndUpdate = findOneAndUpdateStub;

    const data = { deco: "MARBRE NERF", ref: "94953664" };
    const result = await claimStubOrCreate(FakeDeco, 167731, data);

    expect(result).to.equal(claimed);
    expect(findOneAndUpdateStub.calledTwice).to.be.true;
    expect(
      findOneAndUpdateStub.calledWith(
        { numCmd: 167731, gamesysStub: true, ref: "94953664" },
        { $set: { ...data, gamesysStub: false } },
        { new: true },
      ),
    ).to.be.true;
  });

  it("ne tente pas le repli par ref quand sousDossier est déjà connu (le 1er filtre fait foi)", async () => {
    const findOneAndUpdateStub = sinon.stub().resolves(null);
    const saveStub = sinon.stub().resolves();
    function FakeDeco(data) {
      Object.assign(this, data);
      this.save = saveStub;
    }
    FakeDeco.findOneAndUpdate = findOneAndUpdateStub;

    await claimStubOrCreate(FakeDeco, 167731, { deco: "MARBRE NERF", ref: "94953664", sousDossier: "07" });

    expect(findOneAndUpdateStub.calledOnce).to.be.true;
    expect(saveStub.calledOnce).to.be.true;
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
      {
        sousNumero: "00",
        profileReferences: [{ reference: "94964465" }],
        kitPosesReferences: [],
        visualReferences: [],
      },
      {
        sousNumero: "01",
        profileReferences: [],
        kitPosesReferences: [{ reference: "94953593" }],
        visualReferences: [],
      },
      {
        sousNumero: "02",
        profileReferences: [],
        kitPosesReferences: [],
        visualReferences: [{ reference: "94953000" }],
      },
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
