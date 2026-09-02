const { expect } = require("chai");
const sinon = require("sinon");

const dossierService = require("../../server/src/gamesys/services/dossierService");
const dbConfig = require("../../server/src/gamesys/config/db");
const Deco = require("../../server/src/models/Deco");
const ConsommationCommande = require("../../server/src/models/ConsommationCommande");
const profilsKitsService = require("../../server/src/services/profilsKitsService");
const stockArticleReconciliationService = require("../../server/src/services/stockArticleReconciliationService");
const { syncGamesysExtraction } = require("../../server/src/services/gamesysExtractionSyncService");

const DEFAULT_COMMANDE_INFO = {
  dateCommande: new Date("2026-08-20"),
  codeClient: "LM019",
  refClient: "REF-CLIENT",
  nombreProfil: 0,
  nombreKitPose: 0,
  prixTotal: 1250.5,
  formatPlaqueGamesys: "1510 x 2600",
  dateDepartUsine: null,
  dateLivraisonSouhaitee: new Date("2026-09-23"),
  mag: "CHOLET",
};

describe("gamesysExtractionSyncService.syncGamesysExtraction()", () => {
  let listCandidatsStub;
  let decoFindStub;
  let consoFindStub;
  let findOneAndUpdateStub;
  let getDbConnectionStub;
  let fetchGroupedStub;
  let deriveInfoStub;
  let saveProfilsKitsStub;
  let reconcileStub;
  let fakeConnection;

  const sinceDate = new Date("2026-08-01");

  beforeEach(() => {
    fakeConnection = { close: sinon.stub().resolves() };
    listCandidatsStub = sinon.stub(dossierService, "listCommandesRecentes");
    decoFindStub = sinon.stub(Deco, "find").returns({ lean: sinon.stub().resolves([]) });
    consoFindStub = sinon.stub(ConsommationCommande, "find").returns({ lean: sinon.stub().resolves([]) });
    findOneAndUpdateStub = sinon.stub(Deco, "findOneAndUpdate").resolves();
    getDbConnectionStub = sinon.stub(dbConfig, "getDbConnection").resolves(fakeConnection);
    fetchGroupedStub = sinon.stub(dossierService, "fetchDossierGroupedDetail").resolves({ sousDossiers: [] });
    deriveInfoStub = sinon.stub(dossierService, "deriveCommandeInfoFromGrouped").returns({ ...DEFAULT_COMMANDE_INFO });
    saveProfilsKitsStub = sinon.stub(profilsKitsService, "saveProfilsKitsFromGrouped").resolves([]);
    reconcileStub = sinon
      .stub(stockArticleReconciliationService, "reconcileStockArticlesFromConsommations")
      .resolves({ orphelinsDetectes: 0, crees: 0 });
  });

  afterEach(() => sinon.restore());

  it("ne traite rien et ne touche pas Gamesys quand il n'y a aucun candidat", async () => {
    listCandidatsStub.resolves([]);

    const resume = await syncGamesysExtraction({ sinceDate });

    expect(resume).to.include({ candidats: 0, dejaExistants: 0, decoTraites: 0, consoTraites: 0, erreurs: 0 });
    expect(getDbConnectionStub.called).to.be.false;
  });

  it("ignore un candidat déjà présent en Deco ET en ConsommationCommande, sans appel Gamesys", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);
    decoFindStub.returns({ lean: sinon.stub().resolves([{ numCmd: 167648 }]) });
    consoFindStub.returns({ lean: sinon.stub().resolves([{ numCmd: 167648 }]) });

    const resume = await syncGamesysExtraction({ sinceDate });

    expect(resume).to.include({ candidats: 1, dejaExistants: 1, decoTraites: 0, consoTraites: 0 });
    expect(getDbConnectionStub.called).to.be.false;
  });

  it("Deco manquant seul : crée le stub, n'appelle pas saveProfilsKitsFromGrouped", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);
    consoFindStub.returns({ lean: sinon.stub().resolves([{ numCmd: 167648 }]) });

    const resume = await syncGamesysExtraction({ sinceDate });

    expect(resume.decoTraites).to.equal(1);
    expect(findOneAndUpdateStub.calledOnce).to.be.true;
    expect(saveProfilsKitsStub.called).to.be.false;
  });

  it("ConsommationCommande manquante seule : appelle saveProfilsKitsFromGrouped, ne crée pas de stub Deco", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);
    decoFindStub.returns({ lean: sinon.stub().resolves([{ numCmd: 167648 }]) });

    const resume = await syncGamesysExtraction({ sinceDate });

    expect(resume.consoTraites).to.equal(1);
    expect(saveProfilsKitsStub.calledOnce).to.be.true;
    expect(saveProfilsKitsStub.firstCall.args[1]).to.deep.equal({
      cmd: "167648",
      client: "LM",
      isPkOnly: false,
      ville: "",
    });
    expect(findOneAndUpdateStub.called).to.be.false;
  });

  it("en dry-run, compte les candidats sans écrire ni appeler Gamesys", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);

    const resume = await syncGamesysExtraction({ sinceDate, dryRun: true });

    expect(resume).to.include({ candidats: 1, dejaExistants: 0, decoTraites: 0, consoTraites: 0 });
    expect(getDbConnectionStub.called).to.be.false;
    expect(findOneAndUpdateStub.called).to.be.false;
    expect(saveProfilsKitsStub.called).to.be.false;
  });

  it("crée un stub par sous-dossier visuel avec ref/deco du catalogue quand la référence matche", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);
    consoFindStub.returns({ lean: sinon.stub().resolves([{ numCmd: 167648 }]) });
    fetchGroupedStub.resolves({
      sousDossiers: [
        {
          sousNumero: "07",
          printFinish: "MAT",
          formatFini: "126x260",
          visualReferences: [
            { reference: "REF123", libelle: "Jaspe Gauche 100 x 210 cm (M)", endv_px_total: 199.9, endv_quant: 2 },
          ],
        },
      ],
    });
    sinon.stub(Deco, "resolveRefFields").resolves({ matched: true, finition: "Mat", format: "100x210", deco: "JASPE" });

    const resume = await syncGamesysExtraction({ sinceDate });

    expect(resume.decoTraites).to.equal(1);
    const call = findOneAndUpdateStub.getCalls().find((c) => c.args[0].sousDossier === "07");
    expect(call).to.exist;
    expect(call.args[1].$setOnInsert).to.include({
      numCmd: 167648,
      sousDossier: "07",
      ref: "REF123",
      finition: "Mat",
      format: "100x210",
      deco: "JASPE",
      ex: 2,
      prix: 199.9,
      status: "A lancer",
      gamesysStub: true,
    });
  });

  it("se rabat sur format/finition/deco Gamesys bruts quand la référence ne matche aucun catalogue", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);
    consoFindStub.returns({ lean: sinon.stub().resolves([{ numCmd: 167648 }]) });
    fetchGroupedStub.resolves({
      sousDossiers: [
        {
          sousNumero: "07",
          printFinish: "BRILLANT",
          formatFini: "126x260",
          visualReferences: [
            { reference: "TEXTE-LIBRE", libelle: "Jaspe Gauche 100 x 210 cm (M)", endv_px_total: 199.9, endv_quant: 2 },
          ],
        },
      ],
    });
    sinon.stub(Deco, "resolveRefFields").resolves({ matched: false, finition: "" });

    await syncGamesysExtraction({ sinceDate });

    const call = findOneAndUpdateStub.getCalls().find((c) => c.args[0].sousDossier === "07");
    const inserted = call.args[1].$setOnInsert;
    expect(inserted.ref).to.be.undefined;
    expect(inserted).to.include({
      format: "126x260",
      finition: "Brillant",
      deco: "Jaspe Gauche 100 x 210 cm (M)",
    });
  });

  it("pose les champs sur-mesure (deco nettoyé, finition = vernis, orientation, cote client)", async () => {
    listCandidatsStub.resolves([{ cmd: "167302", client: "LM" }]);
    consoFindStub.returns({ lean: sinon.stub().resolves([{ numCmd: 167302 }]) });
    fetchGroupedStub.resolves({
      sousDossiers: [
        {
          sousNumero: "05",
          printFinish: "MAT",
          formatFini: "125x210",
          visualReferences: [
            {
              reference: "ARCHE BEIGE CENTRE 86.9 X 201.5 MAT",
              libelle: "Panneau déco sur-mesure 125x210 Finition Texturée",
              endv_px_total: 199,
              endv_quant: 1,
              surMesure: true,
              surMesureKind: "visuel",
              deco: "ARCHE BEIGE",
              finition: "TEXTUREE",
              format: "125x210",
              orientation: "CENTRE",
              printFormat: "86.9x201.5",
            },
          ],
        },
      ],
    });
    sinon.stub(Deco, "resolveRefFields").resolves({ matched: false, finition: "" });

    await syncGamesysExtraction({ sinceDate });

    const call = findOneAndUpdateStub.getCalls().find((c) => c.args[0].sousDossier === "05");
    const inserted = call.args[1].$setOnInsert;
    expect(inserted).to.include({
      deco: "ARCHE BEIGE",
      finition: "Mat",
      format: "125x210",
      surMesure: true,
      surMesureKind: "visuel",
      orientation: "CENTRE",
      comment: "Cote client : 86,9 × 201,5 cm",
    });
  });

  it("repli stub unique métadonnées commande (pkOnly déduit) quand aucun visuel n'est résolu", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);
    consoFindStub.returns({ lean: sinon.stub().resolves([{ numCmd: 167648 }]) });
    fetchGroupedStub.resolves({ sousDossiers: [{ sousNumero: "00", visualReferences: [] }] });
    deriveInfoStub.returns({ ...DEFAULT_COMMANDE_INFO, nombreProfil: 3, nombreKitPose: 0 });

    await syncGamesysExtraction({ sinceDate });

    expect(findOneAndUpdateStub.calledOnce).to.be.true;
    const [filter, update] = findOneAndUpdateStub.firstCall.args;
    expect(filter).to.deep.equal({ numCmd: 167648 });
    expect(update.$setOnInsert).to.include({ numCmd: 167648, pkOnly: true, status: "A lancer", gamesysStub: true });
  });

  it("mag : repli fc_references (fetchDossierLivraisonDates) quand grouped n'a pas encore de mag, sauf ECOM", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);
    consoFindStub.returns({ lean: sinon.stub().resolves([{ numCmd: 167648 }]) });
    deriveInfoStub.returns({ ...DEFAULT_COMMANDE_INFO, mag: null });
    const fetchLivraisonStub = sinon
      .stub(dossierService, "fetchDossierLivraisonDates")
      .resolves({ villeRef: "CHOLET (REF)", magasinRef: null });

    await syncGamesysExtraction({ sinceDate });

    expect(fetchLivraisonStub.calledOnceWith(fakeConnection, "167648")).to.be.true;
    const [, update] = findOneAndUpdateStub.firstCall.args;
    expect(update.$setOnInsert.mag).to.equal("CHOLET (REF)");
  });

  it("mag : pas de repli fc_references pour ECOM", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "ECOM" }]);
    consoFindStub.returns({ lean: sinon.stub().resolves([{ numCmd: 167648 }]) });
    deriveInfoStub.returns({ ...DEFAULT_COMMANDE_INFO, mag: null });
    const fetchLivraisonStub = sinon.stub(dossierService, "fetchDossierLivraisonDates").resolves({});

    await syncGamesysExtraction({ sinceDate });

    expect(fetchLivraisonStub.called).to.be.false;
    const [, update] = findOneAndUpdateStub.firstCall.args;
    expect(update.$setOnInsert.mag).to.be.undefined;
  });

  it("un sous-dossier en échec n'empêche pas la création du stub des autres sous-dossiers", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);
    consoFindStub.returns({ lean: sinon.stub().resolves([{ numCmd: 167648 }]) });
    fetchGroupedStub.resolves({
      sousDossiers: [
        { sousNumero: "01", printFinish: "MAT", formatFini: "100x210", visualReferences: [{ reference: "REF-KO" }] },
        { sousNumero: "02", printFinish: "MAT", formatFini: "100x210", visualReferences: [{ reference: "REF-OK" }] },
      ],
    });
    const resolveStub = sinon.stub(Deco, "resolveRefFields");
    resolveStub.withArgs("LM", "REF-KO").rejects(new Error("resolveRefFields KO"));
    resolveStub.withArgs("LM", "REF-OK").resolves({ matched: true, finition: "Mat", format: "100x210", deco: "OK" });

    const resume = await syncGamesysExtraction({ sinceDate });

    expect(resume.decoTraites).to.equal(1);
    expect(resume.decoErreurs).to.equal(0);
    const okCall = findOneAndUpdateStub.getCalls().find((c) => c.args[0].sousDossier === "02");
    expect(okCall).to.exist;
    const koCall = findOneAndUpdateStub.getCalls().find((c) => c.args[0].sousDossier === "01");
    expect(koCall).to.be.undefined;
  });

  it("comptabilise decoErreurs quand TOUS les sous-dossiers échouent", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);
    consoFindStub.returns({ lean: sinon.stub().resolves([{ numCmd: 167648 }]) });
    fetchGroupedStub.resolves({
      sousDossiers: [{ sousNumero: "01", visualReferences: [{ reference: "REF-KO" }] }],
    });
    sinon.stub(Deco, "resolveRefFields").rejects(new Error("resolveRefFields KO"));

    const resume = await syncGamesysExtraction({ sinceDate });

    expect(resume.decoErreurs).to.equal(1);
    expect(resume.decoTraites).to.equal(0);
  });

  it("échec de fetchDossierGroupedDetail : comptabilisé en erreur, ni Deco ni conso traités", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);
    fetchGroupedStub.rejects(new Error("ODBC timeout"));

    const resume = await syncGamesysExtraction({ sinceDate });

    expect(resume.erreurs).to.equal(1);
    expect(resume.decoTraites).to.equal(0);
    expect(resume.consoTraites).to.equal(0);
    expect(saveProfilsKitsStub.called).to.be.false;
    expect(findOneAndUpdateStub.called).to.be.false;
    expect(fakeConnection.close.calledOnce).to.be.true;
  });

  it("comptabilise en erreur (pas en traité) quand saveProfilsKitsFromGrouped retourne false", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);
    decoFindStub.returns({ lean: sinon.stub().resolves([{ numCmd: 167648 }]) });
    saveProfilsKitsStub.resolves(false);

    const resume = await syncGamesysExtraction({ sinceDate });

    expect(resume.consoTraites).to.equal(0);
    expect(resume.consoErreurs).to.equal(1);
    expect(resume.erreurs).to.equal(1);
  });

  it("ignore les candidats avec un cmd non numérique, sans requêter Mongo ni Gamesys", async () => {
    listCandidatsStub.resolves([{ cmd: "abc", client: "LM" }]);

    const resume = await syncGamesysExtraction({ sinceDate });

    expect(resume).to.include({ candidats: 1, dejaExistants: 0, decoTraites: 0, consoTraites: 0 });
    expect(decoFindStub.called).to.be.false;
    expect(consoFindStub.called).to.be.false;
    expect(getDbConnectionStub.called).to.be.false;
  });

  it("inclut le résultat de la réconciliation stock_profiles dans le résumé", async () => {
    listCandidatsStub.resolves([]);
    reconcileStub.resolves({ orphelinsDetectes: 3, crees: 2 });

    const resume = await syncGamesysExtraction({ sinceDate });

    expect(resume.orphelinsDetectes).to.equal(3);
    expect(resume.orphelinsReconcilies).to.equal(2);
    expect(reconcileStub.calledOnceWith({ dryRun: false })).to.be.true;
  });

  it("ferme la connexion ODBC même si le traitement du candidat échoue", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);
    consoFindStub.returns({ lean: sinon.stub().resolves([{ numCmd: 167648 }]) });
    fetchGroupedStub.resolves({
      sousDossiers: [{ sousNumero: "01", visualReferences: [{ reference: "REF-KO" }] }],
    });
    sinon.stub(Deco, "resolveRefFields").rejects(new Error("KO"));

    await syncGamesysExtraction({ sinceDate });

    expect(fakeConnection.close.calledOnce).to.be.true;
  });
});
