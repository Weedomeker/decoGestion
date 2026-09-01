/**
 * Script ponctuel : peuple Deco.prixTotal pour les stubs "profils/kits seulement" (pkOnly: true)
 * déjà en base, à partir des articles de la ConsommationCommande correspondante. Ces stubs n'ont
 * pas de visuel (pas de deco/ref/format), donc pas de Deco.prix possible — mais leur prixTotal est
 * le total réel de la commande de profils/kits.
 *
 * Usage :
 *   node server/scripts/backfillPkOnlyPrixTotal.js            (dry-run)
 *   node server/scripts/backfillPkOnlyPrixTotal.js --apply     (exécution réelle)
 *
 * Respecte NODE_ENV comme le reste de l'app (server/src/mongoose.js) :
 * NODE_ENV=development -> base "Test", sinon -> base "DecoKin" (prod).
 * Vérifiez bien NODE_ENV avant de lancer --apply contre la prod.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const { backfillPkOnlyPrixTotal } = require("../src/services/pkOnlyPrixBackfillService");

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

  const resume = await backfillPkOnlyPrixTotal({ dryRun: !apply });

  console.log("\nRésumé :");
  console.log(`  Stubs pkOnly sans prixTotal : ${resume.candidats}`);
  if (apply) {
    console.log(`  Mis à jour                  : ${resume.misAJour}`);
    console.log(`  Introuvables (ConsommationCommande/articles sans prix) : ${resume.introuvables}`);
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
