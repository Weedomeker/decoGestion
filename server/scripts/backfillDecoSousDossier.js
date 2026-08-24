/**
 * Script ponctuel : peuple Deco.sousDossier (suffixe "/NN" du sous-dossier Gamesys du visuel,
 * ex: "07" pour "167648/07") pour les documents existants qui ne l'ont pas encore (créés avant
 * l'ajout de ce champ). Matching par format+nom sur fd_entete_devi.endv_identif (voir
 * decoSousDossierBackfillService.js) — les cas ambigus (plusieurs sous-dossiers candidats) sont
 * ignorés plutôt que de deviner, et comptés séparément dans le résumé.
 *
 * Usage :
 *   node server/scripts/backfillDecoSousDossier.js            (dry-run)
 *   node server/scripts/backfillDecoSousDossier.js --apply     (exécution réelle)
 *
 * Respecte NODE_ENV comme le reste de l'app (server/src/mongoose.js) :
 * NODE_ENV=development -> base "Test", sinon -> base "DecoKin" (prod).
 * Vérifiez bien NODE_ENV avant de lancer --apply contre la prod.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const { backfillDecoSousDossier } = require("../src/services/decoSousDossierBackfillService");

function parseArgs(argv) {
  const args = { apply: false };
  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
  }
  return args;
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));

  console.log(`NODE_ENV=${process.env.NODE_ENV || "(non défini)"} — connexion MongoDB...`);
  await connectMongo();
  if (mongoose.connection.readyState !== 1) {
    console.error("MongoDB indisponible, abandon.");
    process.exit(1);
  }
  console.log(`Connecté à la base "${mongoose.connection.name}".`);
  console.log(apply ? "Mode réel — écriture en base." : "Mode DRY-RUN — aucune donnée écrite.");

  const resume = await backfillDecoSousDossier({ dryRun: !apply });

  console.log("\nRésumé :");
  console.log(`  Documents sans sousDossier : ${resume.candidats}`);
  if (apply) {
    console.log(`  Mis à jour                  : ${resume.misAJour}`);
    console.log(`    dont par jointure (fs_stock) : ${resume.resolusParJointure}`);
    console.log(`    dont par texte (endv_identif): ${resume.resolusParTexte}`);
    console.log(`  Ambigus (ignorés)           : ${resume.ambigus}`);
    console.log(`  Erreurs                     : ${resume.erreurs}`);
  } else {
    console.log("\nMode dry-run — relancer avec --apply pour écrire réellement.");
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error("Erreur fatale :", error);
  process.exit(1);
});
