const pLimit = require("p-limit");
const logger = require("../logger/logger");
const dossierService = require("../gamesys/services/dossierService");
const ConsommationCommande = require("../models/ConsommationCommande");
// Import via objet module (pas destructuré) pour permettre le stub sinon en test
const profilsKitsService = require("./profilsKitsService");
const stockArticleReconciliationService = require("./stockArticleReconciliationService");

async function syncConsommationsHistorique({ sinceDate, client, concurrency = 5, dryRun = false } = {}) {
  const candidats = await dossierService.listCommandesAvecProfilsKits({ sinceDate, client });

  const resume = { candidats: candidats.length, dejaExistants: 0, traites: 0, erreurs: 0 };
  const aTraiter = [];

  for (const candidate of candidats) {
    const numCmd = parseInt(candidate.cmd, 10);
    if (!numCmd || Number.isNaN(numCmd)) continue;

    const dejaPresent = await ConsommationCommande.exists({ numCmd });
    if (dejaPresent) {
      resume.dejaExistants += 1;
      continue;
    }
    aTraiter.push(candidate);
  }

  if (!dryRun) {
    const limit = pLimit(concurrency);
    await Promise.all(
      aTraiter.map((candidate) =>
        limit(async () => {
          try {
            // saveProfilsKits ne lève jamais d'exception sur un échec Gamesys (best-effort ailleurs,
            // cf. jobsController.js) — elle renvoie `false` dans ce cas précis pour qu'on le compte en
            // erreur plutôt qu'en traité (sinon la commande reste indéfiniment "traitée avec succès"
            // dans les logs sans jamais avoir de ConsommationCommande créée).
            const result = await profilsKitsService.saveProfilsKits({
              cmd: candidate.cmd,
              client: candidate.client,
              isPkOnly: false,
              ville: "",
            });
            if (result === false) {
              resume.erreurs += 1;
              logger.warn(`syncConsommationsHistorique: échec cmd=${candidate.cmd} client=${candidate.client} (getDossierDetail)`);
            } else {
              resume.traites += 1;
            }
          } catch (err) {
            resume.erreurs += 1;
            logger.warn(
              `syncConsommationsHistorique: échec cmd=${candidate.cmd} client=${candidate.client} : ${err.message}`,
            );
          }
        }),
      ),
    );
  }

  // Filet de sécurité : rattrape les refs présentes dans consommations_commandes mais jamais
  // créées dans stock_profiles (ex: upsert StockArticle ayant échoué silencieusement dans saveProfilsKits).
  const reconciliation = await stockArticleReconciliationService.reconcileStockArticlesFromConsommations({ dryRun });
  resume.orphelinsDetectes = reconciliation.orphelinsDetectes;
  resume.orphelinsReconcilies = reconciliation.crees;

  return resume;
}

module.exports = { syncConsommationsHistorique };
