const { expect } = require("chai");
const sinon = require("sinon");
const BackfillWatermark = require("../../server/src/models/BackfillWatermark");
const { resolveSinceDate, marquerRun } = require("../../server/src/services/backfillWatermarkService");

describe("backfillWatermarkService", () => {
  afterEach(() => sinon.restore());

  it("renvoie la fenêtre défaut quand aucun watermark", async () => {
    sinon.stub(BackfillWatermark, "findById").returns({ lean: sinon.stub().resolves(null) });
    const since = await resolveSinceDate({ cle: "k", fenetreDefautJours: 5 });
    const attendu = Date.now() - 5 * 24 * 3600 * 1000;
    expect(Math.abs(since.getTime() - attendu)).to.be.lessThan(5000);
  });

  it("renvoie (dernier run - marge) quand plus récent que la fenêtre défaut", async () => {
    const ranAt = new Date(Date.now() - 2 * 24 * 3600 * 1000); // il y a 2 j
    sinon.stub(BackfillWatermark, "findById").returns({ lean: sinon.stub().resolves({ ranAt }) });
    const since = await resolveSinceDate({ cle: "k", fenetreDefautJours: 30, margeJours: 1 });
    const attendu = ranAt.getTime() - 24 * 3600 * 1000;
    expect(Math.abs(since.getTime() - attendu)).to.be.lessThan(5000);
  });

  it("ne remonte jamais avant la fenêtre défaut même si le dernier run est très ancien", async () => {
    const ranAt = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    sinon.stub(BackfillWatermark, "findById").returns({ lean: sinon.stub().resolves({ ranAt }) });
    const since = await resolveSinceDate({ cle: "k", fenetreDefautJours: 5 });
    const attendu = Date.now() - 5 * 24 * 3600 * 1000;
    expect(Math.abs(since.getTime() - attendu)).to.be.lessThan(5000);
  });

  it("fenêtre défaut si la lecture Mongo lève", async () => {
    sinon.stub(BackfillWatermark, "findById").returns({ lean: sinon.stub().rejects(new Error("db")) });
    const since = await resolveSinceDate({ cle: "k", fenetreDefautJours: 3 });
    expect(since).to.be.instanceOf(Date);
  });

  it("marquerRun fait un upsert et n'échoue pas si Mongo lève", async () => {
    const upd = sinon.stub(BackfillWatermark, "updateOne").rejects(new Error("db"));
    await marquerRun("k");
    expect(upd.calledOnceWith({ _id: "k" }, { $set: { ranAt: sinon.match.date } }, { upsert: true })).to.be.true;
  });
});
