/**
 * Script ponctuel : peuple Deco.prix (prix Gamesys fd_entete_devi.endv_px_total de la ligne
 * correspondant précisément à ce visuel, par opposition à Deco.prixTotal qui est la somme de
 * toute la commande) pour les documents existants qui ne l'ont pas encore.
 *
 * Une seule connexion ODBC réutilisée pour tout le run, requête légère par numCmd
 * (fetchEnteteDevis, sans jointures stock) — voir decoPrixVisuelBackfillService.js pour le détail.
 * Une première version basée sur getDossierDetail (une connexion neuve par sous-dossier, jointures
 * stock incluses) a fini par saturer les ressources machine sur un run de plusieurs milliers de
 * numCmd ; celle-ci est volontairement plus légère.
 *
 * Usage :
 *   node server/scripts/backfillDecoPrixVisuel.js            (dry-run)
 *   node server/scripts/backfillDecoPrixVisuel.js --apply     (exécution réelle)
 *   node server/scripts/backfillDecoPrixVisuel.js --apply --numCmds=164629,165675   (sous-ensemble)
 *
 * Respecte NODE_ENV comme le reste de l'app (server/src/mongoose.js) :
 * NODE_ENV=development -> base "Test", sinon -> base "DecoKin" (prod).
 * Vérifiez bien NODE_ENV avant de lancer --apply contre la prod.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const { backfillDecoPrixVisuel } = require("../src/services/decoPrixVisuelBackfillService");

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

  const resume = await backfillDecoPrixVisuel({ dryRun: !apply, numCmds });

  console.log("\nRésumé :");
  console.log(`  Documents sans prix : ${resume.candidats}`);
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
