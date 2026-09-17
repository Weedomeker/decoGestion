/**
 * Script ponctuel : re-vérifie TOUS les documents Deco.prix (déjà remplis ou non) et corrige ceux
 * dont la valeur stockée ne correspond plus au matching corrigé (désambiguïsation par format quand
 * un même nom de visuel existe en plusieurs formats sans endv_ref_client Gamesys pour les
 * distinguer — cas réel constaté sur la commande 167602, backfillé initialement avec le mauvais
 * prix pour le format 150x255 au lieu du 100x255).
 *
 * Usage :
 *   node server/scripts/repairDecoPrixVisuel.js            (dry-run)
 *   node server/scripts/repairDecoPrixVisuel.js --apply     (exécution réelle)
 *   node server/scripts/repairDecoPrixVisuel.js --apply --numCmds=167602   (sous-ensemble)
 *
 * Respecte NODE_ENV comme le reste de l'app (server/src/mongoose.js) :
 * NODE_ENV=development -> base "Test", sinon -> base "DecoKin" (prod).
 * Vérifiez bien NODE_ENV avant de lancer --apply contre la prod.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const { repairDecoPrixVisuel } = require("../src/services/decoPrixVisuelBackfillService");

function parseArgs(argv) {
  const args = { apply: false, numCmds: null };
  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg.startsWith("--numCmds=")) {
      args.numCmds = arg
        .slice("--numCmds=".length)
        .split(",")
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n));
    }
  }
  return args;
}

async function main() {
  const { apply, numCmds } = parseArgs(process.argv.slice(2));

  console.log(`NODE_ENV=${process.env.NODE_ENV || "(non défini)"} — connexion MongoDB...`);
  await connectMongo();
  if (mongoose.connection.readyState !== 1) {
    console.error("MongoDB indisponible, abandon.");
    process.exit(1);
  }
  console.log(`Connecté à la base "${mongoose.connection.name}".`);
  console.log(apply ? "Mode réel — écriture en base." : "Mode DRY-RUN — aucune donnée écrite.");
  if (numCmds) console.log(`Limité à ${numCmds.length} numCmd fournis en argument.`);

  const resume = await repairDecoPrixVisuel({ dryRun: !apply, numCmds });

  console.log("\nRésumé :");
  console.log(`  Documents examinés : ${resume.candidats}`);
  if (apply) {
    console.log(`  Corrigés (prix erroné remplacé) : ${resume.corriges}`);
    console.log(`  Remplis (prix absent, maintenant fixé) : ${resume.misAJour}`);
    console.log(`  Inchangés (déjà corrects)      : ${resume.inchanges}`);
    console.log(`  Introuvables dans Gamesys      : ${resume.introuvables}`);
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
