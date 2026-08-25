/**
 * Script ponctuel : supprime les stubs Gamesys par sous-dossier (gamesysStub:true, status:"A
 * lancer") devenus orphelins parce que le job correspondant a été traité via le flux normal de
 * l'appli SANS transmettre job.sousDossier — claimStubOrCreate (decoStubService.js) ne réclame alors
 * que les stubs sans sousDossier (par sécurité, pour ne jamais réclamer le mauvais panneau d'une
 * commande à plusieurs visuels), donc un nouveau document a été créé à côté au lieu de réutiliser le
 * stub. Détection par même numCmd + même ref sur un document déjà traité (gamesysStub != true) —
 * voir decoGamesysStubDuplicatesCleanupService.js.
 *
 * Usage :
 *   node server/scripts/cleanupDecoGamesysStubDuplicates.js            (dry-run)
 *   node server/scripts/cleanupDecoGamesysStubDuplicates.js --apply     (exécution réelle)
 *
 * Respecte NODE_ENV comme le reste de l'app (server/src/mongoose.js) :
 * NODE_ENV=development -> base "Test", sinon -> base "DecoKin" (prod).
 * Vérifiez bien NODE_ENV avant de lancer --apply contre la prod.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const { cleanupDecoGamesysStubDuplicates } = require("../src/services/decoGamesysStubDuplicatesCleanupService");

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
  console.log(apply ? "Mode réel — suppression des doublons." : "Mode DRY-RUN — aucune donnée touchée.");

  const resume = await cleanupDecoGamesysStubDuplicates({ dryRun: !apply });

  console.log("\nRésumé :");
  console.log(`  Stubs "A lancer" par sous-dossier examinés : ${resume.candidats}`);
  console.log(`  Doublons détectés (deco déjà traité ailleurs) : ${resume.doublons}`);
  if (resume.numCmds.length) console.log(`    numCmds : ${resume.numCmds.join(", ")}`);
  if (apply) {
    console.log(`  Supprimés : ${resume.supprimes}`);
  } else {
    console.log("\nMode dry-run — relancer avec --apply pour supprimer réellement.");
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error("Erreur fatale :", error);
  process.exit(1);
});
