const { expect } = require("chai");
const sinon = require("sinon");

const Deco = require("../../server/src/models/Deco");
const {
  cleanupDecoGamesysStubDuplicates,
} = require("../../server/src/services/decoGamesysStubDuplicatesCleanupService");

describe("decoGamesysStubDuplicatesCleanupService.cleanupDecoGamesysStubDuplicates()", () => {
  let findStub;
  let existsStub;
  let deleteManyStub;

  function stubFind(docs) {
    const fakeQuery = {
      select: sinon.stub().returnsThis(),
      lean: sinon.stub().resolves(docs),
    };
    findStub.returns(fakeQuery);
  }

  beforeEach(() => {
    findStub = sinon.stub(Deco, "find");
    existsStub = sinon.stub(Deco, "exists").resolves(null);
    deleteManyStub = sinon.stub(Deco, "deleteMany").resolves({ deletedCount: 0 });
  });

  afterEach(() => {
    sinon.restore();
  });

  it("filtre sur gamesysStub:true, status:'A lancer', sousDossier et ref exploitables", async () => {
    stubFind([]);

    await cleanupDecoGamesysStubDuplicates({ dryRun: false });

    expect(
      findStub.calledOnceWith({
        gamesysStub: true,
        status: "A lancer",
        sousDossier: { $exists: true, $ne: "" },
        ref: { $nin: [null, ""] },
      }),
    ).to.be.true;
  });

  it("ne compte pas comme doublon un stub sans document déjà traité pour le même numCmd+ref", async () => {
    stubFind([{ _id: "a", numCmd: 167731, sousDossier: "07", deco: "MARBRE NERF", ref: "94953664" }]);
    existsStub.resolves(null);

    const resume = await cleanupDecoGamesysStubDuplicates({ dryRun: false });

    expect(resume).to.deep.equal({ candidats: 1, doublons: 0, numCmds: [], supprimes: 0 });
    expect(deleteManyStub.called).to.be.false;
  });

  it("ne supprime rien en dry-run même si des doublons existent", async () => {
    stubFind([{ _id: "a", numCmd: 167731, sousDossier: "07", deco: "MARBRE NERF", ref: "94953664" }]);
    existsStub.resolves(true);

    const resume = await cleanupDecoGamesysStubDuplicates({ dryRun: true });

    expect(resume).to.deep.equal({ candidats: 1, doublons: 1, numCmds: [167731], supprimes: 0 });
    expect(deleteManyStub.called).to.be.false;
  });

  it("ne confond pas deux panneaux distincts du même décor (même deco, ref différente)", async () => {
    // 2 stubs "MARBRE NERF" du même numCmd, refs différentes (panneaux distincts) : seul celui dont
    // la ref exacte a déjà un document traité ailleurs doit être considéré comme doublon.
    stubFind([
      { _id: "a", numCmd: 167731, sousDossier: "07", deco: "MARBRE NERF", ref: "94953664" },
      { _id: "b", numCmd: 167731, sousDossier: "06", deco: "MARBRE NERF", ref: "94953642" },
    ]);
    existsStub.withArgs({ numCmd: 167731, ref: "94953664", gamesysStub: { $ne: true } }).resolves(true);
    existsStub.withArgs({ numCmd: 167731, ref: "94953642", gamesysStub: { $ne: true } }).resolves(null);

    const resume = await cleanupDecoGamesysStubDuplicates({ dryRun: true });

    expect(resume).to.deep.equal({ candidats: 2, doublons: 1, numCmds: [167731], supprimes: 0 });
  });

  it("supprime les stubs pour lesquels un document déjà traité partage numCmd+ref", async () => {
    stubFind([
      { _id: "a", numCmd: 167731, sousDossier: "07", deco: "MARBRE NERF", ref: "94953664" },
      { _id: "b", numCmd: 167731, sousDossier: "06", deco: "MARBRE NERF", ref: "94953642" },
    ]);
    existsStub.resolves(true);
    deleteManyStub.resolves({ deletedCount: 2 });

    const resume = await cleanupDecoGamesysStubDuplicates({ dryRun: false });

    expect(existsStub.calledWith({ numCmd: 167731, ref: "94953664", gamesysStub: { $ne: true } })).to.be.true;
    expect(deleteManyStub.calledOnceWith({ _id: { $in: ["a", "b"] } })).to.be.true;
    expect(resume).to.deep.equal({ candidats: 2, doublons: 2, numCmds: [167731], supprimes: 2 });
  });
});
