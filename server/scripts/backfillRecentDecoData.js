/**
 * Script ponctuel : rejoue manuellement le backfill des prix/date de livraison des commandes
 * récentes ajoutées sans passer par Gamesys (mêmes 5 backfills que le job automatique au démarrage
 * du serveur, cf. server/src/services/startupPrixBackfillService.js et server.js).
 *
 * Usage :
 *   node server/scripts/backfillRecentDecoData.js                  (dry-run, 2 derniers jours)
 *   node server/scripts/backfillRecentDecoData.js --apply          (exécution réelle, 2 derniers jours)
 *   node server/scripts/backfillRecentDecoData.js --apply --days=7 (fenêtre élargie, ex: après une panne)
 *
 * Respecte NODE_ENV comme le reste de l'app (server/src/mongoose.js) :
 * NODE_ENV=development -> base "Test", sinon -> base "DecoKin" (prod).
 * Vérifiez bien NODE_ENV avant de lancer --apply contre la prod.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const { backfillRecentDecoData } = require("../src/services/startupPrixBackfillService");

function parseArgs(argv) {
  const args = { apply: false, days: 2 };
  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg.startsWith("--days=")) args.days = parseInt(arg.split("=")[1], 10) || args.days;
  }
  return args;
}

async function main() {
  const { apply, days } = parseArgs(process.argv.slice(2));

  console.log(`NODE_ENV=${process.env.NODE_ENV || "(non défini)"} — connexion MongoDB...`);
  await connectMongo();
  if (mongoose.connection.readyState !== 1) {
    console.error("MongoDB indisponible, abandon.");
    process.exit(1);
  }
  console.log(`Connecté à la base "${mongoose.connection.name}".`);
  console.log(apply ? "Mode réel — écriture en base." : "Mode DRY-RUN — aucune donnée écrite.");

  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  console.log(`Fenêtre : documents créés depuis ${sinceDate.toISOString()} (${days}j).`);

  const resultats = await backfillRecentDecoData({ sinceDate, dryRun: !apply });

  console.log("\nRésumé :");
  for (const [etape, resume] of Object.entries(resultats)) {
    console.log(`  ${etape} : ${resume ? JSON.stringify(resume) : "échoué (voir logs)"}`);
  }
  if (!apply) {
    console.log("\nMode dry-run — relancer avec --apply pour écrire réellement.");
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error("Erreur fatale :", error);
  process.exit(1);
});
