const { expect } = require("chai");
const sinon = require("sinon");

const Deco = require("../../server/src/models/Deco");
const ConsommationCommande = require("../../server/src/models/ConsommationCommande");
const { backfillPkOnlyPrixTotal } = require("../../server/src/services/pkOnlyPrixBackfillService");

describe("pkOnlyPrixBackfillService.backfillPkOnlyPrixTotal()", () => {
  let findStub;
  let findOneStub;
  let updateOneStub;

  beforeEach(() => {
    findStub = sinon.stub(Deco, "find").returns({ lean: sinon.stub() });
    findOneStub = sinon.stub(ConsommationCommande, "findOne").returns({ lean: sinon.stub() });
    updateOneStub = sinon.stub(Deco, "updateOne").resolves({ modifiedCount: 1 });
  });

  afterEach(() => {
    sinon.restore();
  });

  function mockStubs(docs) {
    findStub.returns({ lean: sinon.stub().resolves(docs) });
  }

  function mockConso(numCmd, articles) {
    findOneStub.withArgs({ numCmd }, { articles: 1 }).returns({ lean: sinon.stub().resolves(articles ? { articles } : null) });
  }

  it("interroge les stubs pkOnly sans prixTotal", async () => {
    mockStubs([]);

    await backfillPkOnlyPrixTotal({ dryRun: false });

    expect(findStub.firstCall.args[0]).to.deep.equal({ pkOnly: true, prixTotal: { $exists: false } });
  });

  it("ajoute createdAt au filtre quand sinceDate est fourni", async () => {
    mockStubs([]);
    const sinceDate = new Date("2026-08-18T00:00:00.000Z");

    await backfillPkOnlyPrixTotal({ dryRun: false, sinceDate });

    expect(findStub.firstCall.args[0]).to.deep.equal({
      pkOnly: true,
      prixTotal: { $exists: false },
      createdAt: { $gte: sinceDate },
    });
  });

  it("ne modifie rien en dry-run", async () => {
    mockStubs([{ _id: "a", numCmd: 167452 }]);

    const resume = await backfillPkOnlyPrixTotal({ dryRun: true });

    expect(resume.candidats).to.equal(1);
    expect(findOneStub.called).to.be.false;
    expect(updateOneStub.called).to.be.false;
  });

  it("peuple prixTotal à partir de la somme des articles de la ConsommationCommande", async () => {
    mockStubs([{ _id: "a", numCmd: 167452 }]);
    mockConso(167452, [{ prix: 68.6 }]);

    const resume = await backfillPkOnlyPrixTotal({ dryRun: false });

    expect(resume.misAJour).to.equal(1);
    expect(updateOneStub.calledWith({ _id: "a", prixTotal: { $exists: false } }, { $set: { prixTotal: 68.6 } })).to.be
      .true;
  });

  it("compte introuvable quand la ConsommationCommande n'a aucun article avec prix", async () => {
    mockStubs([{ _id: "b", numCmd: 167638 }]);
    mockConso(167638, [{ prix: undefined }]);

    const resume = await backfillPkOnlyPrixTotal({ dryRun: false });

    expect(resume.introuvables).to.equal(1);
    expect(updateOneStub.called).to.be.false;
  });

  it("compte introuvable quand aucune ConsommationCommande ne correspond", async () => {
    mockStubs([{ _id: "c", numCmd: 999999 }]);
    mockConso(999999, null);

    const resume = await backfillPkOnlyPrixTotal({ dryRun: false });

    expect(resume.introuvables).to.equal(1);
  });

  it("compte erreur et continue si une mise à jour échoue", async () => {
    mockStubs([
      { _id: "a", numCmd: 167452 },
      { _id: "b", numCmd: 167539 },
    ]);
    mockConso(167452, [{ prix: 68.6 }]);
    mockConso(167539, [{ prix: 102.99 }]);
    updateOneStub.onFirstCall().rejects(new Error("Mongo indisponible"));
    updateOneStub.onSecondCall().resolves({ modifiedCount: 1 });

    const resume = await backfillPkOnlyPrixTotal({ dryRun: false });

    expect(resume.erreurs).to.equal(1);
    expect(resume.misAJour).to.equal(1);
  });
});
