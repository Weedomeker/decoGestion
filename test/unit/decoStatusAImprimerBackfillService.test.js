const { expect } = require("chai");
const sinon = require("sinon");

const Deco = require("../../server/src/models/Deco");
const { backfillDecoStatusAImprimer } = require("../../server/src/services/decoStatusAImprimerBackfillService");

describe("decoStatusAImprimerBackfillService.backfillDecoStatusAImprimer()", () => {
  let countStub;
  let updateManyStub;

  beforeEach(() => {
    countStub = sinon.stub(Deco, "countDocuments");
    updateManyStub = sinon.stub(Deco, "updateMany").resolves({ modifiedCount: 0 });
  });

  afterEach(() => {
    sinon.restore();
  });

  it("filtre sur gamesysStub != true et status:\"\" (exclut les stubs en attente)", async () => {
    countStub.resolves(0);

    await backfillDecoStatusAImprimer({ dryRun: false });

    expect(countStub.calledOnceWith({ gamesysStub: { $ne: true }, status: "" })).to.be.true;
  });

  it("ne modifie rien en dry-run même s'il y a des candidats", async () => {
    countStub.resolves(4);

    const resume = await backfillDecoStatusAImprimer({ dryRun: true });

    expect(resume).to.deep.equal({ candidats: 4, misAJour: 0 });
    expect(updateManyStub.called).to.be.false;
  });

  it("ne fait aucun appel updateMany quand il n'y a aucun candidat", async () => {
    countStub.resolves(0);

    const resume = await backfillDecoStatusAImprimer({ dryRun: false });

    expect(resume).to.deep.equal({ candidats: 0, misAJour: 0 });
    expect(updateManyStub.called).to.be.false;
  });

  it("met à jour status:\"A imprimer\" sur les documents trouvés", async () => {
    countStub.resolves(8);
    updateManyStub.resolves({ modifiedCount: 8 });

    const resume = await backfillDecoStatusAImprimer({ dryRun: false });

    expect(resume).to.deep.equal({ candidats: 8, misAJour: 8 });
    expect(
      updateManyStub.calledOnceWith({ gamesysStub: { $ne: true }, status: "" }, { $set: { status: "A imprimer" } }),
    ).to.be.true;
  });
});
