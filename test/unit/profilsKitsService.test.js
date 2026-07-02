const { expect } = require("chai");
const sinon = require("sinon");

// On stub les modules avant de require le service
const dossierService = require("../../server/src/gamesys/services/dossierService");
const StockArticle = require("../../server/src/models/StockArticle");
const ConsommationCommande = require("../../server/src/models/ConsommationCommande");
const Deco = require("../../server/src/models/Deco");
const { saveProfilsKits } = require("../../server/src/services/profilsKitsService");

const GROUPED_WITH_PROFIL = {
  profileReferences: [
    { reference: "P001", articleReference: "P001", modele: "PROFIL BLANC", libelle: "PROFIL BLANC 255", codeTarif: "", famille: "PROFIL", sousFamille: "" },
  ],
  kitPosesReferences: [],
  sousDossiers: [
    {
      dossier: { dos_date: "2025-02-19" },
      enteteDevis: [
        { endv_identif: "PROFIL BLANC 255", endv_quant: 3 },
        { endv_identif: "VISUEL MOSAIQUE", endv_quant: 1 },
      ],
    },
  ],
};

const GROUPED_WITH_KIT = {
  profileReferences: [],
  kitPosesReferences: [
    { reference: "KIT001", articleReference: "KIT001", modele: "KIT POSE", libelle: "KIT DE POSE", codeTarif: "KITPOSE", famille: "KIT", sousFamille: "" },
  ],
  sousDossiers: [
    {
      enteteDevis: [
        { endv_identif: "KIT DE POSE", endv_quant: 2 },
      ],
    },
  ],
};

const GROUPED_EMPTY = {
  profileReferences: [],
  kitPosesReferences: [],
  sousDossiers: [],
};

describe("profilsKitsService.saveProfilsKits()", () => {
  let getDossierDetailStub;
  let stockArticleStub;
  let consommationUpsertStub;
  let consommationCreateStub;
  let decoUpsertStub;

  beforeEach(() => {
    getDossierDetailStub = sinon.stub(dossierService, "getDossierDetail");
    stockArticleStub = sinon.stub(StockArticle, "findOneAndUpdate").resolves({});
    consommationUpsertStub = sinon
      .stub(ConsommationCommande, "findOneAndUpdate")
      .resolves({ lastErrorObject: { updatedExisting: false } });
    // create() ne doit plus être utilisé (remplacé par l'upsert atomique ci-dessus)
    consommationCreateStub = sinon
      .stub(ConsommationCommande, "create")
      .rejects(new Error("create() ne doit plus être appelé — utiliser findOneAndUpdate"));
    decoUpsertStub = sinon.stub(Deco, "findOneAndUpdate").resolves({});
  });

  afterEach(() => {
    sinon.restore();
  });

  const fakeJob = (cmd = 164629, client = "LM") => ({ cmd, client });

  it("appelle getDossierDetail avec commande=cmd et view=summary", async () => {
    getDossierDetailStub.resolves(GROUPED_EMPTY);

    await saveProfilsKits(fakeJob(164629));

    expect(getDossierDetailStub.calledOnce).to.be.true;
    expect(getDossierDetailStub.firstCall.args[0]).to.deep.equal({
      commande: "164629",
      view: "summary",
    });
  });

  it("ne crée pas de ConsommationCommande si aucun profil ni kit", async () => {
    getDossierDetailStub.resolves(GROUPED_EMPTY);

    await saveProfilsKits(fakeJob());

    expect(consommationUpsertStub.called).to.be.false;
    expect(stockArticleStub.called).to.be.false;
  });

  it("upserte un StockArticle pour un profil trouvé", async () => {
    getDossierDetailStub.resolves(GROUPED_WITH_PROFIL);

    await saveProfilsKits(fakeJob());

    expect(stockArticleStub.calledOnce).to.be.true;
    const [filter, update, opts] = stockArticleStub.firstCall.args;
    expect(filter).to.deep.equal({ ref: "P001" });
    expect(update.$setOnInsert.type).to.equal("profil");
    expect(opts.upsert).to.be.true;
  });

  it("crée ConsommationCommande avec quantité issue de l'entête devis (profil) via upsert atomique", async () => {
    getDossierDetailStub.resolves(GROUPED_WITH_PROFIL);

    await saveProfilsKits(fakeJob(164629, "LM"));

    expect(consommationUpsertStub.calledOnce).to.be.true;
    expect(consommationCreateStub.called).to.be.false;
    const [filter, update, opts] = consommationUpsertStub.firstCall.args;
    expect(filter).to.deep.equal({ numCmd: 164629 });
    expect(opts.upsert).to.be.true;
    const created = update.$setOnInsert;
    expect(created.numCmd).to.equal(164629);
    expect(created.client).to.equal("LM");
    expect(created.articles).to.have.length(1);
    expect(created.articles[0].ref).to.equal("P001");
    expect(created.articles[0].type).to.equal("profil");
    expect(created.articles[0].quantite).to.equal(3);
  });

  it("renseigne dateCommande à partir de dos_date du premier sous-dossier", async () => {
    getDossierDetailStub.resolves(GROUPED_WITH_PROFIL);

    await saveProfilsKits(fakeJob(164629, "LM"));

    const [, update] = consommationUpsertStub.firstCall.args;
    const created = update.$setOnInsert;
    expect(created.dateCommande).to.be.instanceOf(Date);
    expect(created.dateCommande.toISOString().slice(0, 10)).to.equal("2025-02-19");
  });

  it("laisse dateCommande indéfini si aucun sous-dossier n'a de dos_date", async () => {
    getDossierDetailStub.resolves(GROUPED_WITH_KIT); // sousDossiers sans champ dossier

    await saveProfilsKits(fakeJob());

    const [, update] = consommationUpsertStub.firstCall.args;
    expect(update.$setOnInsert.dateCommande).to.be.undefined;
  });

  it("crée ConsommationCommande avec quantité pour un kit", async () => {
    getDossierDetailStub.resolves(GROUPED_WITH_KIT);

    await saveProfilsKits(fakeJob());

    const [, update] = consommationUpsertStub.firstCall.args;
    const created = update.$setOnInsert;
    expect(created.articles[0].type).to.equal("kit");
    expect(created.articles[0].quantite).to.equal(2);
  });

  it("ne recrée pas la consommation si elle existe déjà (upsert idempotent)", async () => {
    getDossierDetailStub.resolves(GROUPED_WITH_PROFIL);
    consommationUpsertStub.resolves({ lastErrorObject: { updatedExisting: true } });

    const result = await saveProfilsKits(fakeJob(164629, "LM"));

    expect(result).to.be.null;
    expect(decoUpsertStub.called).to.be.false;
  });

  it("ne propage pas une exception si getDossierDetail échoue", async () => {
    getDossierDetailStub.rejects(new Error("ODBC timeout"));

    // Ne doit pas lever d'exception
    let threw = false;
    try { await saveProfilsKits(fakeJob()); }
    catch { threw = true; }
    expect(threw).to.be.false;
  });

  it("attribue la quantité correcte par libelle quand plusieurs profils distincts existent", async () => {
    const groupedMultiProfil = {
      profileReferences: [
        { reference: "P001", articleReference: "P001", modele: "PROFIL BLANC", libelle: "PROFIL BLANC 255", codeTarif: "" },
        { reference: "P002", articleReference: "P002", modele: "CORNIERE", libelle: "CORNIERE ALU", codeTarif: "" },
      ],
      kitPosesReferences: [],
      sousDossiers: [
        {
          enteteDevis: [
            { endv_identif: "PROFIL BLANC 255", endv_quant: 3 },
            { endv_identif: "CORNIERE ALU", endv_quant: 1 },
          ],
        },
      ],
    };

    getDossierDetailStub.resolves(groupedMultiProfil);

    await saveProfilsKits(fakeJob(164629, "LM"));

    expect(consommationUpsertStub.calledOnce).to.be.true;
    const [, update] = consommationUpsertStub.firstCall.args;
    const created = update.$setOnInsert;
    expect(created.articles).to.have.length(2);

    const profilBlanc = created.articles.find((a) => a.ref === "P001");
    const corniere = created.articles.find((a) => a.ref === "P002");
    expect(profilBlanc.quantite).to.equal(3);
    expect(corniere.quantite).to.equal(1);
  });
});
