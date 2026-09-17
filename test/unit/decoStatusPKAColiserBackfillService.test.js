const { expect } = require("chai");
const sinon = require("sinon");

const Deco = require("../../server/src/models/Deco");
const { backfillDecoStatusPKAColiser } = require("../../server/src/services/decoStatusPKAColiserBackfillService");

describe("decoStatusPKAColiserBackfillService.backfillDecoStatusPKAColiser()", () => {
  let countStub;
  let updateManyStub;

  beforeEach(() => {
    countStub = sinon.stub(Deco, "countDocuments");
    updateManyStub = sinon.stub(Deco, "updateMany").resolves({ modifiedCount: 0 });
  });

  afterEach(() => {
    sinon.restore();
  });

  it("filtre sur gamesysStub != true, pkOnly:true et status:\"\" (exclut stubs en attente et visuels)", async () => {
    countStub.resolves(0);

    await backfillDecoStatusPKAColiser({ dryRun: false });

    expect(countStub.calledOnceWith({ gamesysStub: { $ne: true }, pkOnly: true, status: { $in: ["", "A imprimer"] } })).to.be.true;
  });

  it("ne modifie rien en dry-run même s'il y a des candidats", async () => {
    countStub.resolves(3);

    const resume = await backfillDecoStatusPKAColiser({ dryRun: true });

    expect(resume).to.deep.equal({ candidats: 3, misAJour: 0 });
    expect(updateManyStub.called).to.be.false;
  });

  it("ne fait aucun appel updateMany quand il n'y a aucun candidat", async () => {
    countStub.resolves(0);

    const resume = await backfillDecoStatusPKAColiser({ dryRun: false });

    expect(resume).to.deep.equal({ candidats: 0, misAJour: 0 });
    expect(updateManyStub.called).to.be.false;
  });

  it("met à jour status:\"PK à coliser\" sur les documents pkOnly trouvés", async () => {
    countStub.resolves(6);
    updateManyStub.resolves({ modifiedCount: 6 });

    const resume = await backfillDecoStatusPKAColiser({ dryRun: false });

    expect(resume).to.deep.equal({ candidats: 6, misAJour: 6 });
    expect(
      updateManyStub.calledOnceWith({ gamesysStub: { $ne: true }, pkOnly: true, status: { $in: ["", "A imprimer"] } }, { $set: { status: "PK à coliser" } }),
    ).to.be.true;
  });
});
