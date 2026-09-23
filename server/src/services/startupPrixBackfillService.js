const logger = require("../logger/logger");
const { formatResume } = require("../logger/formatResume");
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
    logger.debug(`${name} : ${formatResume(resume)}`);
    return resume;
  } catch (err) {
    logger.warn(`Backfill « ${name} » échoué : ${err.message}`);
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
  const consommationPrix = await runStep(STEP_LABELS.consommationPrix, () =>
    consommationPrixBackfillService.backfillConsommationPrix({ sinceDate, concurrency, dryRun }),
  );
  const pkOnlyPrixTotal = await runStep(STEP_LABELS.pkOnlyPrixTotal, () =>
    pkOnlyPrixBackfillService.backfillPkOnlyPrixTotal({ sinceDate, dryRun }),
  );
  const decoLivraisonDates = await runStep(STEP_LABELS.decoLivraisonDates, () =>
    decoLivraisonDatesBackfillService.backfillDecoLivraisonDates({ sinceDate, concurrency, dryRun }),
  );
  const decoPrix = await runStep(STEP_LABELS.decoPrix, () =>
    decoPrixBackfillService.backfillDecoPrix({ sinceDate, concurrency, dryRun }),
  );
  const decoPrixVisuel = await runStep(STEP_LABELS.decoPrixVisuel, () =>
    decoPrixVisuelBackfillService.backfillDecoPrixVisuel({ sinceDate, dryRun }),
  );
  const decoCommandeInfo = await runStep(STEP_LABELS.decoCommandeInfo, () =>
    decoCommandeInfoBackfillService.backfillDecoCommandeInfo({ sinceDate, concurrency, dryRun }),
  );

  return { consommationPrix, pkOnlyPrixTotal, decoLivraisonDates, decoPrix, decoPrixVisuel, decoCommandeInfo };
}

const STEP_LABELS = {
  consommationPrix: "Prix consommations",
  pkOnlyPrixTotal: "Prix total pkOnly",
  decoLivraisonDates: "Dates de livraison",
  decoPrix: "Prix Deco",
  decoPrixVisuel: "Prix par visuel",
  decoCommandeInfo: "Infos commande",
};

// Résumé sur une ligne pour les logs de démarrage : seules les étapes ayant eu des candidats (ou
// ayant échoué) sont listées, "rien à traiter" sinon.
function formatBackfillResume(resultats) {
  const parts = Object.entries(resultats || {})
    .filter(([, resume]) => resume === null || resume?.candidats !== 0)
    .map(([key, resume]) => `${STEP_LABELS[key] || key} (${resume === null ? "échec" : formatResume(resume)})`);
  return parts.length ? parts.join(" | ") : "rien à traiter";
}

module.exports = { backfillRecentDecoData, formatBackfillResume };
