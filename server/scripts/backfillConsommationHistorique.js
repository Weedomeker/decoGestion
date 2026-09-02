/**
 * Script ponctuel : backfill de l'historique des consommations profilés/kits + stubs Deco depuis
 * Gamesys (extraction unifiée, ex-gamesysConsommationSyncService + ex-decoGamesysStubSyncService).
 *
 * Usage :
 *   node server/scripts/backfillConsommationHistorique.js                          (dry-run, 12 derniers mois, tous clients)
 *   node server/scripts/backfillConsommationHistorique.js --months=6 --client=LM   (dry-run ciblé)
 *   node server/scripts/backfillConsommationHistorique.js --apply                  (exécution réelle)
 *
 * Respecte NODE_ENV comme le reste de l'app (server/src/mongoose.js) :
 * NODE_ENV=development -> base "Test", sinon -> base "DecoKin" (prod).
 * Vérifiez bien NODE_ENV avant de lancer --apply contre la prod.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const { syncGamesysExtraction } = require("../src/services/gamesysExtractionSyncService");

function parseArgs(argv) {
  const args = { months: 12, client: undefined, apply: false };
  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg.startsWith("--months=")) args.months = Number(arg.split("=")[1]);
    else if (arg.startsWith("--client=")) args.client = arg.split("=")[1];
  }
  return args;
}

async function main() {
  const { months, client, apply } = parseArgs(process.argv.slice(2));
  const sinceDate = new Date();
  sinceDate.setMonth(sinceDate.getMonth() - months);

  console.log(`NODE_ENV=${process.env.NODE_ENV || "(non défini)"} — connexion MongoDB...`);
  await connectMongo();
  if (mongoose.connection.readyState !== 1) {
    console.error("MongoDB indisponible, abandon.");
    process.exit(1);
  }
  console.log(`Connecté à la base "${mongoose.connection.name}".`);

  console.log(
    `Backfill depuis ${sinceDate.toISOString().slice(0, 10)} (${months} mois)` +
      `${client ? ` — client=${client}` : " — tous clients"}` +
      `${apply ? "" : " — DRY-RUN"}`,
  );

  const resume = await syncGamesysExtraction({ sinceDate, client, dryRun: !apply });

  console.log("\nRésumé :");
  console.log(`  Candidats trouvés (commandes)      : ${resume.candidats}`);
  console.log(`  Déjà enregistrés en base            : ${resume.dejaExistants}`);
  if (apply) {
    console.log(`  Stubs Deco traités avec succès      : ${resume.decoTraites}`);
    console.log(`  Stubs Deco en erreur                : ${resume.decoErreurs}`);
    console.log(`  Consommations traitées avec succès  : ${resume.consoTraites}`);
    console.log(`  Consommations en erreur             : ${resume.consoErreurs}`);
    console.log(`  Réf. orphelines réconciliées        : ${resume.orphelinsReconcilies} (sur ${resume.orphelinsDetectes} détectées)`);
  } else {
    console.log(`  Restants à traiter (mode réel)      : ${resume.candidats - resume.dejaExistants}`);
    console.log(`  Réf. orphelines détectées           : ${resume.orphelinsDetectes} (stock_profiles)`);
    console.log("\nMode dry-run — aucune donnée écrite. Relancer avec --apply pour importer réellement.");
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error("Erreur fatale :", error);
  process.exit(1);
});
