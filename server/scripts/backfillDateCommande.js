/**
 * Script ponctuel : peuple ConsommationCommande.dateCommande (date Gamesys dos_date) pour les
 * documents existants qui ne l'ont pas encore (créés avant l'ajout de ce champ).
 *
 * Usage :
 *   node server/scripts/backfillDateCommande.js            (dry-run)
 *   node server/scripts/backfillDateCommande.js --apply     (exécution réelle)
 *
 * Respecte NODE_ENV comme le reste de l'app (server/src/mongoose.js) :
 * NODE_ENV=development -> base "Test", sinon -> base "DecoKin" (prod).
 * Vérifiez bien NODE_ENV avant de lancer --apply contre la prod.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const { backfillDateCommande } = require("../src/services/dateCommandeBackfillService");

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

  const resume = await backfillDateCommande({ dryRun: !apply });

  console.log("\nRésumé :");
  console.log(`  Documents sans dateCommande : ${resume.candidats}`);
  if (apply) {
    console.log(`  Mis à jour                  : ${resume.misAJour}`);
    console.log(`  Introuvables dans Gamesys   : ${resume.introuvables}`);
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
