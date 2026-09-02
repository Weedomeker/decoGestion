const { expect } = require("chai");
const sinon = require("sinon");
const RefDeco = require("../../server/src/models/RefDeco");
const RefEcom = require("../../server/src/models/RefEcom");
const RefBrico = require("../../server/src/models/RefBrico");
const RefCasto = require("../../server/src/models/RefCasto");
const { fetchDossierGroupedDetail } = require("../../server/src/gamesys/services/dossierService");

// findStockReferences (appelée par buildDetail) retombe en dernier recours sur un lookup Mongo
// direct {model,format} (priorité 4, cf. dossierService.findStockReferences.test.js) — sans base
// Mongo connectée en test unitaire, un .find() réel resterait bufferisé indéfiniment. On stub les 4
// modèles Ref* pour ne rien résoudre (résolution stock déjà couverte par
// dossierService.findStockReferences.test.js, hors scope ici).
function stubRefModelsNoMatch() {
  for (const Model of [RefDeco, RefEcom, RefBrico, RefCasto]) {
    sinon.stub(Model, "find").returns({ lean: async () => [] });
    sinon.stub(Model, "findOne").returns({ lean: async () => null });
  }
}

// Connexion fake unique : chaque requête passe par connection.query(sql, params) — router par motif
// SQL, tout ce qui n'est pas explicitement mocké renvoie [] (comportement par défaut de
// fetchOptionalRows/findStockReferences en cas d'absence de lignes). Vérifie surtout que
// fetchDossierGroupedDetail ne réutilise QU'UNE seule connexion injectée (jamais getDbConnection),
// contrairement à getDossierDetail qui en ouvre une par sous-dossier — cf. commentaire de la fonction.
function makeConnection(overrides = {}) {
  const query = sinon.stub().callsFake((sql) => {
    for (const [pattern, rows] of Object.entries(overrides)) {
      if (sql.includes(pattern)) return Promise.resolve(rows);
    }
    return Promise.resolve([]);
  });
  return { query };
}

describe("dossierService.fetchDossierGroupedDetail()", () => {
  afterEach(() => sinon.restore());

  it("regroupe un dossier à un seul sous-dossier avec entête, livraison et formatFini/printFinish", async () => {
    stubRefModelsNoMatch();
    const connection = makeConnection({
      "from public.fd_dossier d where": [
        {
          dos_seq: 1,
          dos_codeuniq: "100473v0",
          dos_no_cmde: "100473/00",
          dos_client: "LM",
          dos_date: "2026-08-20",
          dos_forme_et_format: "Ft. fini : 1000 x 2100 mm",
          dos_supp_1_ft: "1510 x 2600",
          dos_imp_1_fac_p_1: "Mat",
        },
      ],
      "from public.fd_entete_devi where": [
        {
          endv_seq: 1,
          endv_no_dossier: "100473/00",
          endv_no_commande: "100473/00",
          endv_identif: "VISUEL DECOR",
          endv_quant: 1,
          endv_px_total: 120.5,
          endv_cclient: "LM123",
          endv_no_commande_client: "REF-CLIENT-1",
          endv_date_cmde: "2026-08-19",
        },
      ],
      "from public.ff_livraison where": [
        {
          bo_no: 1,
          bo_devis: "100473v0",
          bo_adlivr_nom_1: "LEROY MERLIN CHOLET",
          bo_ville: "CHOLET",
          bo_date_souhaitee: "2026-09-05",
          bo_date_depart_usine: "2026-09-01",
        },
      ],
    });

    const grouped = await fetchDossierGroupedDetail(connection, "100473");

    expect(grouped.sousDossiers).to.have.length(1);
    const sous = grouped.sousDossiers[0];
    expect(sous.enteteDevis).to.have.length(1);
    expect(sous.enteteDevis[0].endv_px_total).to.equal(120.5);
    expect(sous.livraisons).to.have.length(1);
    expect(sous.livraisons[0].bo_ville).to.equal("CHOLET");
    expect(sous.dossier.dos_supp_1_ft).to.equal("1510 x 2600");
    expect(sous.formatFini).to.be.a("string").and.not.empty;
    expect(sous.printFinish).to.exist;

    // Une seule connexion injectée réutilisée pour toutes les requêtes (fd_dossier, fd_entete_devi,
    // ff_livraison, + tous les fetchOptionalRows de buildDetail) — jamais getDbConnection() appelé
    // en interne (sinon la fonction planterait ici, aucune autre connexion n'étant fournie).
    expect(connection.query.callCount).to.be.greaterThan(1);
  });

  it("regroupe plusieurs sous-dossiers d'une même commande", async () => {
    const connection = makeConnection({
      "from public.fd_dossier d where": [
        { dos_seq: 2, dos_codeuniq: "100474v1", dos_no_cmde: "100474/01", dos_client: "CAS" },
        { dos_seq: 1, dos_codeuniq: "100474v0", dos_no_cmde: "100474/00", dos_client: "CAS" },
      ],
    });

    const grouped = await fetchDossierGroupedDetail(connection, "100474");

    expect(grouped.sousDossiers).to.have.length(2);
    expect(grouped.nbSousDossiers).to.equal(2);
  });

  it("renvoie une structure vide (aucun sous-dossier) quand rien ne matche", async () => {
    const connection = makeConnection();

    const grouped = await fetchDossierGroupedDetail(connection, "999999");

    expect(grouped.sousDossiers).to.have.length(0);
  });
});
