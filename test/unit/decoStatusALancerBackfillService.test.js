const { expect } = require("chai");
const sinon = require("sinon");

const Deco = require("../../server/src/models/Deco");
const { backfillDecoStatusALancer } = require("../../server/src/services/decoStatusALancerBackfillService");

describe("decoStatusALancerBackfillService.backfillDecoStatusALancer()", () => {
  let countStub;
  let updateManyStub;

  beforeEach(() => {
    countStub = sinon.stub(Deco, "countDocuments");
    updateManyStub = sinon.stub(Deco, "updateMany").resolves({ modifiedCount: 0 });
  });

  afterEach(() => {
    sinon.restore();
  });

  it("filtre sur gamesysStub:true et status:\"\" uniquement", async () => {
    countStub.resolves(0);

    await backfillDecoStatusALancer({ dryRun: false });

    expect(countStub.calledOnceWith({ gamesysStub: true, status: "" })).to.be.true;
  });

  it("ne modifie rien en dry-run même s'il y a des candidats", async () => {
    countStub.resolves(3);

    const resume = await backfillDecoStatusALancer({ dryRun: true });

    expect(resume).to.deep.equal({ candidats: 3, misAJour: 0 });
    expect(updateManyStub.called).to.be.false;
  });

  it("ne fait aucun appel updateMany quand il n'y a aucun candidat", async () => {
    countStub.resolves(0);

    const resume = await backfillDecoStatusALancer({ dryRun: false });

    expect(resume).to.deep.equal({ candidats: 0, misAJour: 0 });
    expect(updateManyStub.called).to.be.false;
  });

  it("met à jour status:\"A lancer\" sur les stubs trouvés", async () => {
    countStub.resolves(5);
    updateManyStub.resolves({ modifiedCount: 5 });

    const resume = await backfillDecoStatusALancer({ dryRun: false });

    expect(resume).to.deep.equal({ candidats: 5, misAJour: 5 });
    expect(
      updateManyStub.calledOnceWith({ gamesysStub: true, status: "" }, { $set: { status: "A lancer" } }),
    ).to.be.true;
  });
});
