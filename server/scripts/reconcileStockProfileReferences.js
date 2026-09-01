/**
 * Script ponctuel : correction des références non numériques dans stock_profiles.
 *
 * Retrouve, pour chaque StockProfile dont `ref` n'est pas numérique, la ou les commandes
 * Gamesys source (via consommations_commandes.articles, même libellé/type) et rejoue
 * getDossierDetail pour retrouver la référence numérique correcte. Applique ensuite soit
 * une mise à jour simple, soit une fusion (+ suppression du doublon texte) si un StockProfile
 * numérique correspondant existe déjà.
 *
 * Usage :
 *   node server/scripts/reconcileStockProfileReferences.js            (dry-run : affiche sans écrire)
 *   node server/scripts/reconcileStockProfileReferences.js --apply    (corrige/fusionne réellement)
 *
 * Respecte NODE_ENV comme le reste de l'app (server/src/mongoose.js) :
 * NODE_ENV=development -> base "Test", sinon -> base "DecoKin" (prod).
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const {
  reconcileStockProfileReferences,
} = require("../src/services/stockProfileReferenceReconciliationService");

// Contient le mot "cornière" (comme accessoire du bundle) et se fait donc classer comme un
// profil "cornière" par isProfileLabel, alors que ce n'est pas un article cornière — exclu pour
// éviter de lui attribuer par erreur une référence stock de cornière.
const EXCLUDED_LIBELLES = [
  "Kit box à échantillon - PLV 50x150 + cornière à crochet + Echantillons 14x28 + Echantillons 14x14",
];

function describeAction(action) {
  if (action.type === "merge_into_existing") {
    const refsCassees = action.mergedDocs.map((d) => `"${d.ref}"`).join(", ");
    return `  [FUSION] ${refsCassees} -> StockProfile existant ref=${action.targetRef} (+${action.stockAjoute} stockDisponible), doublons supprimés`;
  }
  if (action.type === "update_and_merge_duplicates") {
    const refsCassees = action.mergedDocs.map((d) => `"${d.ref}"`).join(", ");
    return `  [MAJ+FUSION] "${action.ancienRef}" -> ref=${action.nouveauRef} (absorbe ${refsCassees})`;
  }
  return `  [MAJ] "${action.ancienRef}" -> ref=${action.nouveauRef}`;
}

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`NODE_ENV=${process.env.NODE_ENV || "(non défini)"} — connexion MongoDB...`);
  await connectMongo();
  if (mongoose.connection.readyState !== 1) {
    console.error("MongoDB indisponible, abandon.");
    process.exit(1);
  }
  console.log(`Connecté à la base "${mongoose.connection.name}".`);

  const resultat = await reconcileStockProfileReferences({ dryRun: !apply, excludeLibelles: EXCLUDED_LIBELLES });

  console.log("\nRésumé :");
  console.log(`  StockProfile avec ref non numérique : ${resultat.totalCasses}`);
  console.log(`  Résolus via Gamesys                 : ${resultat.resolus}`);
  console.log(`  Non résolus                         : ${resultat.nonResolus}`);

  if (resultat.actions.length) {
    console.log("\nActions :");
    resultat.actions.forEach((a) => console.log(describeAction(a)));
  }

  if (resultat.unresolved.length) {
    console.log("\nNon résolus :");
    resultat.unresolved.forEach((u) =>
      console.log(`  [NON RESOLU] ref="${u.ref}" libelle="${u.libelle}" type=${u.type} — ${u.raison}`),
    );
  }

  if (!apply) {
    console.log("\nMode dry-run — aucune donnée écrite. Relancer avec --apply pour corriger/fusionner réellement.");
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error("Erreur fatale :", error);
  process.exit(1);
});
