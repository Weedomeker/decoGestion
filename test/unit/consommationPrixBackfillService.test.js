const { expect } = require("chai");
const sinon = require("sinon");

const dossierService = require("../../server/src/gamesys/services/dossierService");
const ConsommationCommande = require("../../server/src/models/ConsommationCommande");
const { backfillConsommationPrix } = require("../../server/src/services/consommationPrixBackfillService");

describe("consommationPrixBackfillService.backfillConsommationPrix()", () => {
  let findStub;
  let updateOneStub;
  let getDossierDetailStub;

  beforeEach(() => {
    findStub = sinon.stub(ConsommationCommande, "find").returns({ lean: sinon.stub() });
    updateOneStub = sinon.stub(ConsommationCommande, "updateOne").resolves({});
    getDossierDetailStub = sinon.stub(dossierService, "getDossierDetail");
  });

  afterEach(() => {
    sinon.restore();
  });

  function mockPendingDocs(docs) {
    findStub.returns({ lean: sinon.stub().resolves(docs) });
  }

  it("interroge ConsommationCommande sur les documents ayant au moins un article sans prix", async () => {
    mockPendingDocs([]);

    await backfillConsommationPrix({ dryRun: false });

    expect(findStub.calledOnce).to.be.true;
    expect(findStub.firstCall.args[0]).to.deep.equal({
      articles: { $elemMatch: { prix: { $exists: false } } },
    });
  });

  it("ajoute createdAt au filtre quand sinceDate est fourni", async () => {
    mockPendingDocs([]);
    const sinceDate = new Date("2026-08-18T00:00:00.000Z");

    await backfillConsommationPrix({ dryRun: false, sinceDate });

    expect(findStub.firstCall.args[0]).to.deep.equal({
      articles: { $elemMatch: { prix: { $exists: false } } },
      createdAt: { $gte: sinceDate },
    });
  });

  it("ne modifie rien en dry-run", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 164629, articles: [{ ref: "P001", type: "profil", libelle: "PROFIL BLANC 255" }] }]);

    const resume = await backfillConsommationPrix({ dryRun: true });

    expect(resume.candidats).to.equal(1);
    expect(getDossierDetailStub.called).to.be.false;
    expect(updateOneStub.called).to.be.false;
  });

  it("met à jour uniquement l'article sans prix, préserve les autres champs", async () => {
    mockPendingDocs([
      {
        _id: "a",
        numCmd: 164629,
        articles: [
          { ref: "P001", type: "profil", libelle: "PROFIL BLANC 255", quantite: 3 },
          { ref: "P002", type: "profil", libelle: "CORNIERE ALU", quantite: 1, prix: 28.48 },
        ],
      },
    ]);
    getDossierDetailStub.resolves({
      sousDossiers: [
        {
          enteteDevis: [
            { endv_identif: "PROFIL BLANC 255", endv_px_total: 34.39 },
            { endv_identif: "CORNIERE ALU", endv_px_total: 28.48 },
          ],
        },
      ],
    });

    const resume = await backfillConsommationPrix({ dryRun: false });

    expect(updateOneStub.calledOnce).to.be.true;
    const [filter, update] = updateOneStub.firstCall.args;
    expect(filter).to.deep.equal({ _id: "a" });
    expect(update.$set.articles).to.deep.equal([
      { ref: "P001", type: "profil", libelle: "PROFIL BLANC 255", quantite: 3, prix: 34.39 },
      { ref: "P002", type: "profil", libelle: "CORNIERE ALU", quantite: 1, prix: 28.48 },
    ]);
    expect(resume.misAJour).to.equal(1);
  });

  it("compte introuvable si aucun prix n'a pu être résolu pour aucun article, sans écrire", async () => {
    mockPendingDocs([
      { _id: "a", numCmd: 999999, articles: [{ ref: "P001", type: "profil", libelle: "PROFIL BLANC 255" }] },
    ]);
    getDossierDetailStub.resolves({ sousDossiers: [] });

    const resume = await backfillConsommationPrix({ dryRun: false });

    expect(resume.introuvables).to.equal(1);
    expect(resume.misAJour).to.equal(0);
    expect(updateOneStub.called).to.be.false;
  });

  it("compte erreur et continue si une commande échoue", async () => {
    mockPendingDocs([
      { _id: "a", numCmd: 1, articles: [{ ref: "P001", type: "profil", libelle: "PROFIL BLANC 255" }] },
      { _id: "b", numCmd: 2, articles: [{ ref: "P002", type: "kit", libelle: "KIT DE POSE" }] },
    ]);
    getDossierDetailStub.withArgs({ commande: "1", view: "summary" }).rejects(new Error("ODBC timeout"));
    getDossierDetailStub.withArgs({ commande: "2", view: "summary" }).resolves({
      sousDossiers: [{ enteteDevis: [{ endv_identif: "KIT DE POSE", endv_px_total: 12.5 }] }],
    });

    const resume = await backfillConsommationPrix({ dryRun: false });

    expect(resume.erreurs).to.equal(1);
    expect(resume.misAJour).to.equal(1);
  });

  it("appelle getDossierDetail avec commande=numCmd et view=summary", async () => {
    mockPendingDocs([{ _id: "a", numCmd: 164629, articles: [{ ref: "P001", type: "profil", libelle: "X" }] }]);
    getDossierDetailStub.resolves({ sousDossiers: [] });

    await backfillConsommationPrix({ dryRun: false });

    expect(getDossierDetailStub.calledOnceWith({ commande: "164629", view: "summary" })).to.be.true;
  });
});
