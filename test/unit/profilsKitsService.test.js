const { expect } = require("chai");
const sinon = require("sinon");

// On stub les modules avant de require le service
const dossierService = require("../../server/src/gamesys/services/dossierService");
const StockProfile = require("../../server/src/models/StockProfile");
const ConsommationCommande = require("../../server/src/models/ConsommationCommande");
const Deco = require("../../server/src/models/Deco");
const {
  saveProfilsKits,
  getPrixForArticle,
  getPrixVisuel,
  sumArticlesPrix,
} = require("../../server/src/services/profilsKitsService");
const { isProfileLabel, isKitPoseLabel } = require("../../server/src/gamesys/utils/reference");

const GROUPED_WITH_PROFIL = {
  profileReferences: [
    { reference: "P001", articleReference: "P001", modele: "PROFIL BLANC", libelle: "PROFIL BLANC 255", codeTarif: "", famille: "PROFIL", sousFamille: "" },
  ],
  kitPosesReferences: [],
  sousDossiers: [
    {
      dossier: { dos_date: "2025-02-19" },
      enteteDevis: [
        { endv_identif: "PROFIL BLANC 255", endv_quant: 3, endv_px_total: 34.39 },
        { endv_identif: "VISUEL MOSAIQUE", endv_quant: 1, endv_px_total: 243.69 },
      ],
      livraison: [{ bo_date_depart_usine: "2025-02-20", bo_date_souhaitee: "2025-03-01" }],
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
        { endv_identif: "KIT DE POSE", endv_quant: 2, endv_px_total: 19.9 },
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
    stockArticleStub = sinon.stub(StockProfile, "findOneAndUpdate").resolves({});
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

  it("upserte un StockProfile pour un profil trouvé", async () => {
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
    expect(created.articles[0].prix).to.equal(34.39);
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

  it("renseigne dateDepartUsine et dateLivraisonSouhaitee à partir de la livraison du premier sous-dossier", async () => {
    getDossierDetailStub.resolves(GROUPED_WITH_PROFIL);

    await saveProfilsKits(fakeJob(164629, "LM"));

    const [, update] = consommationUpsertStub.firstCall.args;
    const created = update.$setOnInsert;
    expect(created.dateDepartUsine).to.be.instanceOf(Date);
    expect(created.dateDepartUsine.toISOString().slice(0, 10)).to.equal("2025-02-20");
    expect(created.dateLivraisonSouhaitee).to.be.instanceOf(Date);
    expect(created.dateLivraisonSouhaitee.toISOString().slice(0, 10)).to.equal("2025-03-01");
  });

  it("laisse dateDepartUsine et dateLivraisonSouhaitee indéfinis si aucun sous-dossier n'a de livraison", async () => {
    getDossierDetailStub.resolves(GROUPED_WITH_KIT); // sousDossiers sans champ livraison

    await saveProfilsKits(fakeJob());

    const [, update] = consommationUpsertStub.firstCall.args;
    expect(update.$setOnInsert.dateDepartUsine).to.be.undefined;
    expect(update.$setOnInsert.dateLivraisonSouhaitee).to.be.undefined;
  });

  it("crée ConsommationCommande avec quantité pour un kit", async () => {
    getDossierDetailStub.resolves(GROUPED_WITH_KIT);

    await saveProfilsKits(fakeJob());

    const [, update] = consommationUpsertStub.firstCall.args;
    const created = update.$setOnInsert;
    expect(created.articles[0].type).to.equal("kit");
    expect(created.articles[0].quantite).to.equal(2);
    expect(created.articles[0].prix).to.equal(19.9);
  });

  it("peuple prixTotal du stub pkOnly à partir de la somme des articles", async () => {
    getDossierDetailStub.resolves(GROUPED_WITH_PROFIL);

    await saveProfilsKits({ ...fakeJob(164629, "LM"), isPkOnly: true, ville: "Lille" });

    expect(decoUpsertStub.calledOnce).to.be.true;
    const [filter, update, opts] = decoUpsertStub.firstCall.args;
    expect(filter).to.deep.equal({ numCmd: 164629, pkOnly: true });
    expect(opts.upsert).to.be.true;
    expect(update.$setOnInsert.prixTotal).to.equal(34.39);
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

describe("profilsKitsService.getPrixForArticle()", () => {
  it("somme endv_px_total pour un seul type d'article présent", () => {
    const sousDossiers = [
      { enteteDevis: [{ endv_identif: "PROFIL BLANC 255", endv_px_total: 10 }, { endv_identif: "PROFIL BLANC 255", endv_px_total: 5 }] },
    ];

    const prix = getPrixForArticle(sousDossiers, isProfileLabel, "PROFIL BLANC 255");

    expect(prix).to.equal(15);
  });

  it("filtre par libellé quand plusieurs profils distincts existent", () => {
    const sousDossiers = [
      {
        enteteDevis: [
          { endv_identif: "PROFIL BLANC 255", endv_px_total: 34.39 },
          { endv_identif: "CORNIERE ALU", endv_px_total: 28.48 },
        ],
      },
    ];

    expect(getPrixForArticle(sousDossiers, isProfileLabel, "PROFIL BLANC 255")).to.equal(34.39);
    expect(getPrixForArticle(sousDossiers, isProfileLabel, "CORNIERE ALU")).to.equal(28.48);
  });

  it("retourne undefined si aucune ligne n'a de endv_px_total exploitable", () => {
    const sousDossiers = [{ enteteDevis: [{ endv_identif: "PROFIL BLANC 255", endv_px_total: null }] }];

    expect(getPrixForArticle(sousDossiers, isProfileLabel, "PROFIL BLANC 255")).to.be.undefined;
  });

  it("préserve un prix de 0 (ne le traite pas comme absent)", () => {
    const sousDossiers = [{ enteteDevis: [{ endv_identif: "PROFIL BLANC 255", endv_px_total: 0 }] }];

    expect(getPrixForArticle(sousDossiers, isProfileLabel, "PROFIL BLANC 255")).to.equal(0);
  });

  it("ignore les lignes ne matchant pas le prédicat (kit vs profil)", () => {
    const sousDossiers = [
      {
        enteteDevis: [
          { endv_identif: "KIT DE POSE", endv_px_total: 19.9 },
          { endv_identif: "PROFIL BLANC 255", endv_px_total: 34.39 },
        ],
      },
    ];

    expect(getPrixForArticle(sousDossiers, isKitPoseLabel, "KIT DE POSE")).to.equal(19.9);
  });
});

describe("profilsKitsService.sumArticlesPrix()", () => {
  it("additionne le prix de plusieurs articles", () => {
    expect(sumArticlesPrix([{ prix: 68.6 }, { prix: 47.66 }])).to.equal(116.26);
  });

  it("ignore les articles sans prix exploitable et somme le reste", () => {
    expect(sumArticlesPrix([{ prix: undefined }, { prix: 50.05 }])).to.equal(50.05);
  });

  it("retourne undefined si aucun article n'a de prix (à distinguer d'un total à 0)", () => {
    expect(sumArticlesPrix([{ prix: undefined }])).to.be.undefined;
  });

  it("retourne undefined pour une liste vide ou absente", () => {
    expect(sumArticlesPrix([])).to.be.undefined;
    expect(sumArticlesPrix(undefined)).to.be.undefined;
  });

  it("préserve un total à 0 (ne le traite pas comme absent)", () => {
    expect(sumArticlesPrix([{ prix: 0 }])).to.equal(0);
  });
});

describe("profilsKitsService.getPrixVisuel()", () => {
  let getDossierDetailStub;

  beforeEach(() => {
    getDossierDetailStub = sinon.stub(dossierService, "getDossierDetail");
  });

  afterEach(() => {
    sinon.restore();
  });

  const GROUPED_TWO_VISUELS = {
    visualReferences: [
      { reference: "V001", libelle: "VISUEL MOSAIQUE", endv_px_total: 243.69 },
      { reference: "V002", libelle: "VISUEL RAYURES", endv_px_total: 187.5 },
    ],
    sousDossiers: [
      {
        enteteDevis: [
          { endv_identif: "VISUEL MOSAIQUE", endv_px_total: 243.69 },
          { endv_identif: "VISUEL RAYURES", endv_px_total: 187.5 },
          { endv_identif: "PROFIL BLANC 255", endv_px_total: 34.39 },
        ],
      },
    ],
  };

  it("retourne undefined sans cmd", async () => {
    expect(await getPrixVisuel({ cmd: null, ref: "V001" })).to.be.undefined;
    expect(getDossierDetailStub.called).to.be.false;
  });

  it("matche par référence et retourne le prix de la ligne correspondante", async () => {
    getDossierDetailStub.resolves(GROUPED_TWO_VISUELS);

    const prix = await getPrixVisuel({ cmd: 164629, ref: "V002" });

    expect(getDossierDetailStub.firstCall.args[0]).to.deep.equal({ commande: "164629", view: "summary" });
    expect(prix).to.equal(187.5);
  });

  it("se rabat sur le libellé du visuel quand la référence ne matche aucune ligne", async () => {
    getDossierDetailStub.resolves(GROUPED_TWO_VISUELS);

    const prix = await getPrixVisuel({ cmd: 164629, ref: "INCONNUE", deco: "MOSAIQUE" });

    expect(prix).to.equal(243.69);
  });

  it("retourne undefined si ni la référence ni le libellé ne matchent", async () => {
    getDossierDetailStub.resolves(GROUPED_TWO_VISUELS);

    const prix = await getPrixVisuel({ cmd: 164629, ref: "INCONNUE", deco: "AUTRE CHOSE" });

    expect(prix).to.be.undefined;
  });

  it("retourne undefined si getDossierDetail échoue", async () => {
    getDossierDetailStub.rejects(new Error("ODBC timeout"));

    const prix = await getPrixVisuel({ cmd: 164629, ref: "V001" });

    expect(prix).to.be.undefined;
  });

  it("désambiguïse par format quand deux formats du même visuel matchent le libellé (cas réel cmd 167602)", async () => {
    const groupedDeuxFormats = {
      visualReferences: [
        { reference: "", libelle: "JARDIN SECRET GAUCHE 100x255cm", endv_px_total: 199.39 },
        { reference: "", libelle: "JARDIN SECRET GAUCHE 150x255cm", endv_px_total: 243.69 },
      ],
      sousDossiers: [
        {
          enteteDevis: [
            { endv_identif: "JARDIN SECRET GAUCHE 100x255cm", endv_px_total: 199.39 },
            { endv_identif: "JARDIN SECRET GAUCHE 150x255cm", endv_px_total: 243.69 },
          ],
        },
      ],
    };
    getDossierDetailStub.resolves(groupedDeuxFormats);

    const prix150 = await getPrixVisuel({ cmd: 167602, ref: "94964359", deco: "JARDIN SECRET GAUCHE", format: "150x255" });
    const prix100 = await getPrixVisuel({ cmd: 167602, ref: "94956940", deco: "JARDIN SECRET GAUCHE", format: "100x255" });

    expect(prix150).to.equal(243.69);
    expect(prix100).to.equal(199.39);
  });

  it("matche par v.reference quand v.libelle est un libellé générique identique pour plusieurs visuels (cas réel cmd 167500, BAMBUSA)", async () => {
    const groupedBambusa = {
      visualReferences: [
        { reference: "BAMBUSA DROITE 80 X 230 MAT", libelle: " Format fini : 100.0 x 255.0 cm ", endv_px_total: 229.39 },
        { reference: "BAMBUSA GAUCHE 100 X 230 MAT", libelle: " Format fini : 100.0 x 255.0 cm ", endv_px_total: 258.12 },
      ],
    };
    getDossierDetailStub.resolves(groupedBambusa);

    const prixGauche = await getPrixVisuel({ cmd: 167500, ref: "", deco: "BAMBUSA GAUCHE", format: "100x230" });
    const prixDroite = await getPrixVisuel({ cmd: 167500, ref: "", deco: "BAMBUSA DROITE", format: "80x230" });

    expect(prixGauche).to.equal(258.12);
    expect(prixDroite).to.equal(229.39);
  });

  it("n'additionne pas les prix de visuels partageant le même libelle (non-régression getPrixForArticle)", async () => {
    const grouped = {
      visualReferences: [
        { reference: "PRODUIT A", libelle: "MEME LIBELLE", endv_px_total: 100 },
        { reference: "PRODUIT B", libelle: "MEME LIBELLE", endv_px_total: 250 },
      ],
    };
    getDossierDetailStub.resolves(grouped);

    expect(await getPrixVisuel({ cmd: 1, ref: "", deco: "PRODUIT A" })).to.equal(100);
    expect(await getPrixVisuel({ cmd: 1, ref: "", deco: "PRODUIT B" })).to.equal(250);
  });

  it("prend le prix de l'unique visuel quand le texte ne matche pas, soleDoc=true (cas réel cmd 167637, terrazzo gris / TERRAZZO GR BEIGE)", async () => {
    const grouped = {
      visualReferences: [
        { reference: "255x60cm TERRAZZO GR BEIGE (M)", libelle: "255x60cm TERRAZZO GR BEIGE (M)", endv_px_total: 310 },
      ],
    };
    getDossierDetailStub.resolves(grouped);

    const prix = await getPrixVisuel({ cmd: 167637, ref: "3664715811077", deco: "terrazzo gris", format: "255x60", soleDoc: true });

    expect(prix).to.equal(310);
  });

  it("ne devine pas le prix du visuel unique quand soleDoc=false (garde-fou crédences amalgamées)", async () => {
    const grouped = {
      visualReferences: [
        { reference: "255x60cm TERRAZZO GR BEIGE (M)", libelle: "255x60cm TERRAZZO GR BEIGE (M)", endv_px_total: 310 },
      ],
    };
    getDossierDetailStub.resolves(grouped);

    const prix = await getPrixVisuel({ cmd: 167637, ref: "3664715811077", deco: "terrazzo gris", format: "255x60", soleDoc: false });

    expect(prix).to.be.undefined;
  });

  it("sans soleDoc (valeur par défaut), n'applique pas le fallback visuel unique", async () => {
    const grouped = {
      visualReferences: [
        { reference: "255x60cm TERRAZZO GR BEIGE (M)", libelle: "255x60cm TERRAZZO GR BEIGE (M)", endv_px_total: 310 },
      ],
    };
    getDossierDetailStub.resolves(grouped);

    const prix = await getPrixVisuel({ cmd: 167637, ref: "", deco: "terrazzo gris" });

    expect(prix).to.be.undefined;
  });

  it("n'applique pas le fallback visuel unique quand plusieurs visuels existent, même avec soleDoc=true", async () => {
    getDossierDetailStub.resolves(GROUPED_TWO_VISUELS);

    const prix = await getPrixVisuel({ cmd: 164629, ref: "", deco: "AUTRE CHOSE", soleDoc: true });

    expect(prix).to.be.undefined;
  });
});
