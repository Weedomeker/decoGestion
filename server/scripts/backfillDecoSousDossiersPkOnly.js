/**
 * Script ponctuel : peuple Deco.sousDossiers (suffixes des sous-dossiers Gamesys d'origine des
 * profils/kits agrégés) sur les stubs pkOnly existants créés avant l'ajout de ce champ. Aucune
 * jointure fs_stock nécessaire ici (contrairement à backfillDecoSousDossier.js pour les documents
 * visuel) : un seul appel Gamesys (getDossierDetail) par document suffit — voir
 * decoSousDossiersPkOnlyBackfillService.js.
 *
 * Usage :
 *   node server/scripts/backfillDecoSousDossiersPkOnly.js            (dry-run)
 *   node server/scripts/backfillDecoSousDossiersPkOnly.js --apply     (exécution réelle)
 *
 * Respecte NODE_ENV comme le reste de l'app (server/src/mongoose.js) :
 * NODE_ENV=development -> base "Test", sinon -> base "DecoKin" (prod).
 * Vérifiez bien NODE_ENV avant de lancer --apply contre la prod.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const { backfillDecoSousDossiersPkOnly } = require("../src/services/decoSousDossiersPkOnlyBackfillService");

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

  const resume = await backfillDecoSousDossiersPkOnly({ dryRun: !apply });

  console.log("\nRésumé :");
  console.log(`  Stubs pkOnly sans sousDossiers : ${resume.candidats}`);
  if (apply) {
    console.log(`  Mis à jour                     : ${resume.misAJour}`);
    console.log(`  Sans profil ni kit résolu       : ${resume.sansProfilNiKit}`);
    console.log(`  Erreurs                        : ${resume.erreurs}`);
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
