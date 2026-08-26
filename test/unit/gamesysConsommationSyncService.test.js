const { expect } = require("chai");
const sinon = require("sinon");

const dossierService = require("../../server/src/gamesys/services/dossierService");
const ConsommationCommande = require("../../server/src/models/ConsommationCommande");
const profilsKitsService = require("../../server/src/services/profilsKitsService");
const stockArticleReconciliationService = require("../../server/src/services/stockArticleReconciliationService");
const { syncConsommationsHistorique } = require("../../server/src/services/gamesysConsommationSyncService");

describe("gamesysConsommationSyncService.syncConsommationsHistorique()", () => {
  let listCandidatesStub;
  let existsStub;
  let saveProfilsKitsStub;
  let reconcileStub;

  beforeEach(() => {
    listCandidatesStub = sinon.stub(dossierService, "listCommandesAvecProfilsKits");
    existsStub = sinon.stub(ConsommationCommande, "exists");
    saveProfilsKitsStub = sinon.stub(profilsKitsService, "saveProfilsKits").resolves([]);
    reconcileStub = sinon
      .stub(stockArticleReconciliationService, "reconcileStockArticlesFromConsommations")
      .resolves({ orphelinsDetectes: 0, crees: 0 });
  });

  afterEach(() => {
    sinon.restore();
  });

  const sinceDate = new Date("2026-01-01");

  it("ne traite rien et ne touche pas Gamesys quand il n'y a aucun candidat", async () => {
    listCandidatesStub.resolves([]);

    const resume = await syncConsommationsHistorique({ sinceDate });

    expect(resume).to.deep.equal({
      candidats: 0,
      dejaExistants: 0,
      traites: 0,
      erreurs: 0,
      orphelinsDetectes: 0,
      orphelinsReconcilies: 0,
    });
    expect(saveProfilsKitsStub.called).to.be.false;
  });

  it("ignore (skip) les commandes déjà présentes en base sans appeler saveProfilsKits", async () => {
    listCandidatesStub.resolves([{ cmd: "164629", client: "LM" }]);
    existsStub.resolves(true);

    const resume = await syncConsommationsHistorique({ sinceDate });

    expect(resume).to.include({ candidats: 1, dejaExistants: 1, traites: 0, erreurs: 0 });
    expect(saveProfilsKitsStub.called).to.be.false;
  });

  it("en mode dry-run, compte les candidats restants sans appeler saveProfilsKits ni réconcilier réellement", async () => {
    listCandidatesStub.resolves([
      { cmd: "164629", client: "LM" },
      { cmd: "164630", client: "CASTO" },
    ]);
    existsStub.onFirstCall().resolves(true).onSecondCall().resolves(false);

    const resume = await syncConsommationsHistorique({ sinceDate, dryRun: true });

    expect(resume).to.include({ candidats: 2, dejaExistants: 1, traites: 0, erreurs: 0 });
    expect(saveProfilsKitsStub.called).to.be.false;
    expect(reconcileStub.calledOnceWith({ dryRun: true })).to.be.true;
  });

  it("appelle saveProfilsKits pour chaque commande nouvelle et compte les succès", async () => {
    listCandidatesStub.resolves([
      { cmd: "164629", client: "LM" },
      { cmd: "164630", client: "CASTO" },
    ]);
    existsStub.resolves(false);

    const resume = await syncConsommationsHistorique({ sinceDate });

    expect(resume).to.include({ candidats: 2, dejaExistants: 0, traites: 2, erreurs: 0 });
    expect(saveProfilsKitsStub.calledTwice).to.be.true;
    expect(saveProfilsKitsStub.firstCall.args[0]).to.deep.equal({
      cmd: "164629",
      client: "LM",
      isPkOnly: false,
      ville: "",
    });
  });

  it("comptabilise en erreur (pas en traité) quand saveProfilsKits retourne false (getDossierDetail a échoué en interne sans lever d'exception)", async () => {
    listCandidatesStub.resolves([
      { cmd: "164629", client: "LM" },
      { cmd: "164630", client: "CASTO" },
    ]);
    existsStub.resolves(false);
    saveProfilsKitsStub.onFirstCall().resolves(false);
    saveProfilsKitsStub.onSecondCall().resolves([]);

    const resume = await syncConsommationsHistorique({ sinceDate });

    expect(resume).to.include({ candidats: 2, dejaExistants: 0, traites: 1, erreurs: 1 });
  });

  it("comptabilise les erreurs sans interrompre le traitement des autres candidats", async () => {
    listCandidatesStub.resolves([
      { cmd: "164629", client: "LM" },
      { cmd: "164630", client: "CASTO" },
    ]);
    existsStub.resolves(false);
    saveProfilsKitsStub.onFirstCall().rejects(new Error("ODBC indisponible"));
    saveProfilsKitsStub.onSecondCall().resolves([]);

    const resume = await syncConsommationsHistorique({ sinceDate });

    expect(resume).to.include({ candidats: 2, dejaExistants: 0, traites: 1, erreurs: 1 });
  });

  it("respecte la limite de concurrence fournie", async () => {
    const candidats = Array.from({ length: 8 }, (_, i) => ({ cmd: String(164629 + i), client: "LM" }));
    listCandidatesStub.resolves(candidats);
    existsStub.resolves(false);

    let enCours = 0;
    let maxEnCours = 0;
    saveProfilsKitsStub.callsFake(async () => {
      enCours += 1;
      maxEnCours = Math.max(maxEnCours, enCours);
      await new Promise((resolve) => setTimeout(resolve, 5));
      enCours -= 1;
      return [];
    });

    const resume = await syncConsommationsHistorique({ sinceDate, concurrency: 2 });

    expect(resume.traites).to.equal(8);
    expect(maxEnCours).to.be.at.most(2);
  });

  it("inclut le résultat de la réconciliation stock_profiles dans le résumé", async () => {
    listCandidatesStub.resolves([]);
    reconcileStub.resolves({ orphelinsDetectes: 3, crees: 2 });

    const resume = await syncConsommationsHistorique({ sinceDate });

    expect(resume.orphelinsDetectes).to.equal(3);
    expect(resume.orphelinsReconcilies).to.equal(2);
    expect(reconcileStub.calledOnceWith({ dryRun: false })).to.be.true;
  });
});
