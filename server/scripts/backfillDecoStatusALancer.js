/**
 * Script ponctuel : corrige Deco.status:"" -> "A lancer" sur les stubs Gamesys proactifs
 * (gamesysStub:true) créés avant que decoGamesysStubSyncService.js ne pose ce statut dès la
 * création. Purement Mongo-à-Mongo (aucun appel Gamesys) — voir decoStatusALancerBackfillService.js.
 *
 * Usage :
 *   node server/scripts/backfillDecoStatusALancer.js            (dry-run)
 *   node server/scripts/backfillDecoStatusALancer.js --apply     (exécution réelle)
 *
 * Respecte NODE_ENV comme le reste de l'app (server/src/mongoose.js) :
 * NODE_ENV=development -> base "Test", sinon -> base "DecoKin" (prod).
 * Vérifiez bien NODE_ENV avant de lancer --apply contre la prod.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const { backfillDecoStatusALancer } = require("../src/services/decoStatusALancerBackfillService");

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

  const resume = await backfillDecoStatusALancer({ dryRun: !apply });

  console.log("\nRésumé :");
  console.log(`  Stubs gamesysStub avec status:"" : ${resume.candidats}`);
  if (apply) {
    console.log(`  Mis à jour                       : ${resume.misAJour}`);
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
