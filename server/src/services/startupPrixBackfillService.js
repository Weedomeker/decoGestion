const logger = require("../logger/logger");
// Import via objet module (pas destructuré) pour permettre le stub sinon en test, comme
// consommationPrixBackfillService.js.
const consommationPrixBackfillService = require("./consommationPrixBackfillService");
const pkOnlyPrixBackfillService = require("./pkOnlyPrixBackfillService");
const decoLivraisonDatesBackfillService = require("./decoLivraisonDatesBackfillService");
const decoPrixBackfillService = require("./decoPrixBackfillService");
const decoPrixVisuelBackfillService = require("./decoPrixVisuelBackfillService");
const decoCommandeInfoBackfillService = require("./decoCommandeInfoBackfillService");

async function runStep(name, fn) {
  try {
    const resume = await fn();
    logger.info(`${name} : ${JSON.stringify(resume)}`);
    return resume;
  } catch (err) {
    logger.warn(`${name} échoué : ${err.message}`);
    return null;
  }
}

// Enchaîne séquentiellement les backfills de prix/date récents des commandes ajoutées manuellement
// (sans passer par le pipeline Gamesys normal), afin qu'elles rattrapent les mêmes champs que les
// autres documents. Exécution séquentielle (pas Promise.all) pour ne pas cumuler plusieurs
// connexions ODBC simultanées — cf. decoPrixVisuelBackfillService.js sur le risque de saturation.
// backfillConsommationPrix doit passer avant backfillPkOnlyPrixTotal : ce dernier somme les prix
// d'articles de ConsommationCommande, qui doivent donc déjà être à jour.
async function backfillRecentDecoData({ sinceDate, concurrency = 3, dryRun = false } = {}) {
  const consommationPrix = await runStep("backfillConsommationPrix", () =>
    consommationPrixBackfillService.backfillConsommationPrix({ sinceDate, concurrency, dryRun }),
  );
  const pkOnlyPrixTotal = await runStep("backfillPkOnlyPrixTotal", () =>
    pkOnlyPrixBackfillService.backfillPkOnlyPrixTotal({ sinceDate, dryRun }),
  );
  const decoLivraisonDates = await runStep("backfillDecoLivraisonDates", () =>
    decoLivraisonDatesBackfillService.backfillDecoLivraisonDates({ sinceDate, concurrency, dryRun }),
  );
  const decoPrix = await runStep("backfillDecoPrix", () =>
    decoPrixBackfillService.backfillDecoPrix({ sinceDate, concurrency, dryRun }),
  );
  const decoPrixVisuel = await runStep("backfillDecoPrixVisuel", () =>
    decoPrixVisuelBackfillService.backfillDecoPrixVisuel({ sinceDate, dryRun }),
  );
  const decoCommandeInfo = await runStep("backfillDecoCommandeInfo", () =>
    decoCommandeInfoBackfillService.backfillDecoCommandeInfo({ sinceDate, concurrency, dryRun }),
  );

  return { consommationPrix, pkOnlyPrixTotal, decoLivraisonDates, decoPrix, decoPrixVisuel, decoCommandeInfo };
}

module.exports = { backfillRecentDecoData };
