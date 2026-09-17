/**
 * Script ponctuel : répare les stubs Deco (gamesysStub:true) tombés dans le repli "métadonnées
 * commande" (sans sousDossier, deco/format vides) à cause du bug de connexion ODBC partagée entre
 * candidats traités en parallèle dans syncDecoStubsDepuisGamesys (désormais corrigé — chaque
 * candidat utilise sa propre connexion). Supprime ces stubs vides puis relance la sync Gamesys sur
 * la même fenêtre pour les reconstruire avec les données réellement disponibles côté Gamesys (voir
 * decoGamesysStubRepairService.js).
 *
 * Usage :
 *   node server/scripts/repairDecoGamesysStubs.js                  (dry-run, 5 derniers jours)
 *   node server/scripts/repairDecoGamesysStubs.js --apply          (exécution réelle, 5 derniers jours)
 *   node server/scripts/repairDecoGamesysStubs.js --apply --days=7 (fenêtre élargie)
 *
 * Respecte NODE_ENV comme le reste de l'app (server/src/mongoose.js) :
 * NODE_ENV=development -> base "Test", sinon -> base "DecoKin" (prod).
 * Vérifiez bien NODE_ENV avant de lancer --apply contre la prod.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const { repairDecoGamesysStubs } = require("../src/services/decoGamesysStubRepairService");

function parseArgs(argv) {
  const args = { apply: false, days: 5 };
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
  console.log(apply ? "Mode réel — suppression puis re-sync Gamesys." : "Mode DRY-RUN — aucune donnée touchée.");

  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  console.log(`Fenêtre de re-sync : depuis ${sinceDate.toISOString()} (${days}j).`);

  const resume = await repairDecoGamesysStubs({ sinceDate, dryRun: !apply });

  console.log("\nRésumé :");
  console.log(`  Stubs vides détectés (gamesysStub sans sousDossier, deco/format vides) : ${resume.candidats}`);
  if (resume.numCmds.length) console.log(`    numCmds : ${resume.numCmds.join(", ")}`);
  if (apply) {
    console.log(`  Supprimés                : ${resume.supprimes}`);
    console.log(`  Résultat re-sync Gamesys : ${JSON.stringify(resume.resync)}`);
  } else {
    console.log("\nMode dry-run — relancer avec --apply pour supprimer et relancer la sync Gamesys.");
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error("Erreur fatale :", error);
  process.exit(1);
});
