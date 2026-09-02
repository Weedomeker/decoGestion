const { expect } = require("chai");
const sinon = require("sinon");

const Deco = require("../../server/src/models/Deco");
const gamesysExtractionSyncService = require("../../server/src/services/gamesysExtractionSyncService");
const { repairDecoGamesysStubs } = require("../../server/src/services/decoGamesysStubRepairService");

describe("decoGamesysStubRepairService.repairDecoGamesysStubs()", () => {
  let findStub;
  let deleteManyStub;
  let syncStub;

  const sinceDate = new Date("2026-08-20");

  function stubFind(docs) {
    const fakeQuery = {
      select: sinon.stub().returnsThis(),
      lean: sinon.stub().resolves(docs),
    };
    findStub.returns(fakeQuery);
  }

  beforeEach(() => {
    findStub = sinon.stub(Deco, "find");
    deleteManyStub = sinon.stub(Deco, "deleteMany").resolves({ deletedCount: 0 });
    syncStub = sinon.stub(gamesysExtractionSyncService, "syncGamesysExtraction").resolves({
      candidats: 0,
      dejaExistants: 0,
      decoTraites: 0,
      decoErreurs: 0,
      consoTraites: 0,
      consoErreurs: 0,
      erreurs: 0,
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it("filtre sur gamesysStub:true sans sousDossier et deco/format vides", async () => {
    stubFind([]);

    await repairDecoGamesysStubs({ sinceDate, dryRun: false });

    expect(
      findStub.calledOnceWith({
        gamesysStub: true,
        sousDossier: { $exists: false },
        deco: { $in: [null, ""] },
        format: { $in: [null, ""] },
      }),
    ).to.be.true;
  });

  it("ne supprime rien et ne relance pas la sync en dry-run", async () => {
    stubFind([{ _id: "a", numCmd: 167728 }]);

    const resume = await repairDecoGamesysStubs({ sinceDate, dryRun: true });

    expect(resume).to.deep.equal({ candidats: 1, numCmds: [167728], supprimes: 0, resync: null });
    expect(deleteManyStub.called).to.be.false;
    expect(syncStub.called).to.be.false;
  });

  it("ne fait rien quand il n'y a aucun candidat", async () => {
    stubFind([]);

    const resume = await repairDecoGamesysStubs({ sinceDate, dryRun: false });

    expect(resume).to.deep.equal({ candidats: 0, numCmds: [], supprimes: 0, resync: null });
    expect(deleteManyStub.called).to.be.false;
    expect(syncStub.called).to.be.false;
  });

  it("supprime les stubs vides puis relance la sync Gamesys sur la fenêtre donnée", async () => {
    stubFind([
      { _id: "a", numCmd: 167728 },
      { _id: "b", numCmd: 167723 },
    ]);
    deleteManyStub.resolves({ deletedCount: 2 });
    const resyncResume = {
      candidats: 2,
      dejaExistants: 0,
      decoTraites: 2,
      decoErreurs: 0,
      consoTraites: 0,
      consoErreurs: 0,
      erreurs: 0,
    };
    syncStub.resolves(resyncResume);

    const resume = await repairDecoGamesysStubs({ sinceDate, dryRun: false });

    expect(deleteManyStub.calledOnceWith({ _id: { $in: ["a", "b"] } })).to.be.true;
    expect(syncStub.calledOnceWith({ sinceDate })).to.be.true;
    expect(resume).to.deep.equal({
      candidats: 2,
      numCmds: [167728, 167723],
      supprimes: 2,
      resync: resyncResume,
    });
  });
});
