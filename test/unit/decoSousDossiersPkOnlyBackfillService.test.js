const { expect } = require("chai");
const sinon = require("sinon");

const dossierService = require("../../server/src/gamesys/services/dossierService");
const Deco = require("../../server/src/models/Deco");
const { backfillDecoSousDossiersPkOnly } = require("../../server/src/services/decoSousDossiersPkOnlyBackfillService");

const GROUPED_166239 = {
  sousDossiers: [
    { sousNumero: "00", profileReferences: [{ reference: "94964465" }], kitPosesReferences: [], visualReferences: [] },
    { sousNumero: "01", profileReferences: [], kitPosesReferences: [{ reference: "94953593" }], visualReferences: [] },
    { sousNumero: "02", profileReferences: [], kitPosesReferences: [], visualReferences: [{ reference: "94953000" }] },
  ],
};

describe("decoSousDossiersPkOnlyBackfillService.backfillDecoSousDossiersPkOnly()", () => {
  let findStub;
  let updateOneStub;
  let getDossierDetailStub;

  beforeEach(() => {
    findStub = sinon.stub(Deco, "find").returns({ lean: sinon.stub() });
    updateOneStub = sinon.stub(Deco, "updateOne").resolves({ modifiedCount: 1 });
    getDossierDetailStub = sinon.stub(dossierService, "getDossierDetail");
  });

  afterEach(() => {
    sinon.restore();
  });

  function mockPendingDocs(docs) {
    findStub.returns({ lean: sinon.stub().resolves(docs) });
  }

  it("interroge Deco sur les stubs pkOnly avec numCmd>0 et sousDossiers absent", async () => {
    mockPendingDocs([]);

    await backfillDecoSousDossiersPkOnly({ dryRun: false });

    expect(findStub.calledOnce).to.be.true;
    expect(findStub.firstCall.args[0]).to.deep.equal({
      pkOnly: true,
      numCmd: { $gt: 0 },
      sousDossiers: { $exists: false },
    });
  });

  it("ne modifie rien en dry-run", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 166239 }]);

    const resume = await backfillDecoSousDossiersPkOnly({ dryRun: true });

    expect(resume.candidats).to.equal(1);
    expect(getDossierDetailStub.called).to.be.false;
    expect(updateOneStub.called).to.be.false;
  });

  it("peuple sousDossiers à partir de getDossierDetail (cas réel 166239)", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 166239 }]);
    getDossierDetailStub.withArgs({ commande: "166239", view: "summary" }).resolves(GROUPED_166239);

    const resume = await backfillDecoSousDossiersPkOnly({ dryRun: false });

    expect(resume.misAJour).to.equal(1);
    expect(updateOneStub.calledOnceWith({ _id: "a" }, { $set: { sousDossiers: ["00", "01"] } })).to.be.true;
  });

  it("compte sansProfilNiKit sans écrire quand aucun sous-dossier n'a de profil/kit", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 1 }]);
    getDossierDetailStub.resolves({ sousDossiers: [{ sousNumero: "00", visualReferences: [{}] }] });

    const resume = await backfillDecoSousDossiersPkOnly({ dryRun: false });

    expect(resume.sansProfilNiKit).to.equal(1);
    expect(resume.misAJour).to.equal(0);
    expect(updateOneStub.called).to.be.false;
  });

  it("compte erreur et continue si un document échoue", async () => {
    mockPendingDocs([
      { _id: "a", numCmd: 1 },
      { _id: "b", numCmd: 2 },
    ]);
    getDossierDetailStub.withArgs({ commande: "1", view: "summary" }).rejects(new Error("ODBC timeout"));
    getDossierDetailStub.withArgs({ commande: "2", view: "summary" }).resolves(GROUPED_166239);

    const resume = await backfillDecoSousDossiersPkOnly({ dryRun: false });

    expect(resume.erreurs).to.equal(1);
    expect(resume.misAJour).to.equal(1);
  });
});
