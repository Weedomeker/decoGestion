/**
 * Script ponctuel : correction des références non numériques dans consommations_commandes.
 *
 * Rejoue getDossierDetail sur Gamesys pour chaque commande ayant au moins un article dont
 * la ref n'est pas numérique (fallback vers le libellé brut, notamment les cornières avant
 * le fix de getProfileSearchTerms qui imposait "PROFILE" comme terme de recherche obligatoire).
 * Nécessite un accès ODBC à Gamesys (contrairement à reconcileStockArticles.js qui compare
 * uniquement Mongo → Mongo).
 *
 * Usage :
 *   node server/scripts/reconcileConsommationReferences.js            (dry-run : affiche sans écrire)
 *   node server/scripts/reconcileConsommationReferences.js --apply    (corrige réellement les refs)
 *
 * Respecte NODE_ENV comme le reste de l'app (server/src/mongoose.js) :
 * NODE_ENV=development -> base "Test", sinon -> base "DecoKin" (prod).
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const { reconcileConsommationReferences } = require("../src/services/consommationReferenceReconciliationService");

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`NODE_ENV=${process.env.NODE_ENV || "(non défini)"} — connexion MongoDB...`);
  await connectMongo();
  if (mongoose.connection.readyState !== 1) {
    console.error("MongoDB indisponible, abandon.");
    process.exit(1);
  }
  console.log(`Connecté à la base "${mongoose.connection.name}".`);

  const resultat = await reconcileConsommationReferences({ dryRun: !apply });

  console.log("\nRésumé :");
  console.log(`  Commandes analysées      : ${resultat.commandesAnalysees}`);
  console.log(`  Articles corrigeables    : ${resultat.articlesCorrigeables}`);
  if (apply) {
    console.log(`  Articles corrigés        : ${resultat.articlesCorriges}`);
  } else {
    for (const d of resultat.details) {
      console.log(`    cmd=${d.numCmd} "${d.libelle}" -> ${d.nouveauRef}`);
    }
    console.log("\nMode dry-run — aucune donnée écrite. Relancer avec --apply pour corriger réellement.");
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error("Erreur fatale :", error);
  process.exit(1);
});
