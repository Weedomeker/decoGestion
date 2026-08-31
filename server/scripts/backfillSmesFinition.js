/**
 * Script ponctuel : re-renseigne Deco.finition des panneaux SUR-MESURE (surMesure:true) avec le
 * vernis Mat / Brillant lu dans Gamesys (dos_imp_1_fac_p_1), au lieu de la texture du gabarit
 * ("Lisse"/"Texturée"/"Brossé"/"Couleur") ou d'une casse historique incohérente ("mat"/"MAT").
 *
 * N'écrit que si le vernis résolu diffère de la valeur stockée. Une seule connexion ODBC
 * réutilisée, boucle séquentielle — voir smesFinitionBackfillService.js.
 *
 * Usage :
 *   node server/scripts/backfillSmesFinition.js            (dry-run)
 *   node server/scripts/backfillSmesFinition.js --apply     (exécution réelle)
 *   node server/scripts/backfillSmesFinition.js --apply --since=2025-01-01
 *
 * Respecte NODE_ENV comme le reste de l'app (server/src/mongoose.js) :
 * NODE_ENV=development -> base "Test", sinon -> base "DecoKin" (prod).
 * Vérifiez bien NODE_ENV avant de lancer --apply contre la prod.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const { backfillSmesFinition } = require("../src/services/smesFinitionBackfillService");

function parseArgs(argv) {
  const args = { apply: false, sinceDate: null };
  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg.startsWith("--since=")) {
      const d = new Date(arg.slice("--since=".length));
      if (!Number.isNaN(d.getTime())) args.sinceDate = d;
    }
  }
  return args;
}

async function main() {
  const { apply, sinceDate } = parseArgs(process.argv.slice(2));

  console.log(`NODE_ENV=${process.env.NODE_ENV || "(non défini)"} — connexion MongoDB...`);
  await connectMongo();
  if (mongoose.connection.readyState !== 1) {
    console.error("MongoDB indisponible, abandon.");
    process.exit(1);
  }
  console.log(`Connecté à la base "${mongoose.connection.name}".`);
  console.log(apply ? "Mode réel — écriture en base." : "Mode DRY-RUN — aucune donnée écrite.");
  if (sinceDate) console.log(`Filtre createdAt >= ${sinceDate.toISOString().slice(0, 10)}.`);

  const resume = await backfillSmesFinition({ dryRun: !apply, sinceDate });

  console.log("\nRésumé :");
  console.log(`  Documents sur-mesure examinés : ${resume.candidats}`);
  console.log(`  ${apply ? "Mis à jour" : "À mettre à jour"}          : ${resume.misAJour}`);
  console.log(`  Déjà corrects (inchangés)     : ${resume.inchanges}`);
  console.log(`  Vernis introuvable Gamesys    : ${resume.introuvables}`);
  console.log(`  Erreurs                       : ${resume.erreurs}`);
  if (!apply) console.log("\nMode dry-run — relancer avec --apply pour écrire réellement.");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error("Erreur fatale :", error);
  process.exit(1);
});
