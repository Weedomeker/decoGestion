/**
 * One-off : corrige les documents Deco sur-mesure créés AVANT le support sur-mesure du sync Gamesys
 * (decoGamesysStubSyncService). Ces docs ont `deco` = libellé gabarit générique
 * ("Panneau déco sur-mesure 125x210 Finition Texturée" ou "Format fini : ...") et pas de flag
 * `surMesure`. On rejoue fetchSousDossiersVisuels (déjà enrichi) et on pose le nom nettoyé, la
 * finition du gabarit, le format fini, surMesure/surMesureKind/orientation et la cote client en
 * commentaire — sans toucher `status`.
 *
 * Usage :
 *   node server/scripts/backfillDecoSurMesureStubs.js [Test|DecoKin]           # dry-run (défaut Test)
 *   node server/scripts/backfillDecoSurMesureStubs.js DecoKin --apply          # applique
 *   node server/scripts/backfillDecoSurMesureStubs.js DecoKin --apply --a-lancer  # limite aux stubs status="A lancer"
 *   node server/scripts/backfillDecoSurMesureStubs.js DecoKin --apply --skip-format # n'écrit pas `format` (docs déjà produits)
 *
 * Idempotent : après application, `surMesure: true` exclut les docs déjà traités.
 * Une seule connexion ODBC réutilisée (cf. feedback_odbc_backfill_resource_limits).
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const { MongoClient } = require("mongodb");
const dbConfig = require("../src/gamesys/config/db");
const { closeConnection } = require("../src/gamesys/lib/db");
const dossierService = require("../src/gamesys/services/dossierService");
const { buildCoteClientComment } = require("../src/utils/coteClient");

const DB_NAME = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "Test";
const APPLY = process.argv.includes("--apply");
const A_LANCER_ONLY = process.argv.includes("--a-lancer");
const SKIP_FORMAT = process.argv.includes("--skip-format");
const GENERIC_DECO_RE = /^\s*(panneau\s+d[eé]co\s+sur[-\s]?mesure|format\s+fini\s*:)/i;

function j(v) {
  return JSON.stringify(v);
}

async function main() {
  const uri = `${process.env.MONGO_URL}${DB_NAME}?retryWrites=true&w=majority&appName=Orphea`;
  const client = new MongoClient(uri);
  await client.connect();
  const col = client.db(DB_NAME).collection("lm_commandes");

  console.log(
    `\n=== backfillDecoSurMesureStubs — base ${DB_NAME} — ${APPLY ? "APPLY" : "DRY-RUN"}${A_LANCER_ONLY ? ' — status="A lancer" uniquement' : ""}${SKIP_FORMAT ? " — sans écriture de `format`" : ""} ===\n`,
  );

  const odbcOk = await dbConfig.checkOdbcConnection();
  if (!odbcOk) {
    console.error("ODBC indisponible — abandon.");
    await client.close();
    process.exit(1);
  }

  const filter = { deco: { $regex: GENERIC_DECO_RE }, surMesure: { $ne: true } };
  if (A_LANCER_ONLY) filter.status = "A lancer";
  const docs = await col.find(filter).sort({ numCmd: -1 }).toArray();

  console.log(`${docs.length} document(s) candidat(s) (deco générique, surMesure non posé).\n`);

  const resume = { candidats: docs.length, misAJour: 0, nonResolus: 0, pasSurMesure: 0, erreurs: 0 };

  const byNumCmd = new Map();
  for (const d of docs) {
    if (!byNumCmd.has(d.numCmd)) byNumCmd.set(d.numCmd, []);
    byNumCmd.get(d.numCmd).push(d);
  }

  const connection = await dbConfig.getDbConnection();
  try {
    for (const [numCmd, groupDocs] of byNumCmd.entries()) {
      let sousDossiers;
      try {
        sousDossiers = await dossierService.fetchSousDossiersVisuels(connection, String(numCmd));
      } catch (err) {
        resume.erreurs += groupDocs.length;
        console.log(`  numCmd=${numCmd} : fetchSousDossiersVisuels ÉCHEC — ${err.message}`);
        continue;
      }

      for (const doc of groupDocs) {
        const sd = (sousDossiers || []).find((s) => String(s.sousNumero) === String(doc.sousDossier));
        const visuel = sd?.visualReferences?.[0];

        if (!visuel) {
          resume.nonResolus += 1;
          console.log(`  ${numCmd}/${doc.sousDossier} : non résolu côté Gamesys — inchangé`);
          continue;
        }
        if (!visuel.surMesure) {
          resume.pasSurMesure += 1;
          console.log(`  ${numCmd}/${doc.sousDossier} : Gamesys ne le classe pas sur-mesure — inchangé`);
          continue;
        }

        const set = {
          surMesure: true,
          deco: visuel.deco || doc.deco,
        };
        if (visuel.surMesureKind) set.surMesureKind = visuel.surMesureKind;
        if (visuel.finition) set.finition = visuel.finition;
        if (!SKIP_FORMAT && visuel.format) set.format = visuel.format;
        if (visuel.orientation) set.orientation = visuel.orientation;
        // n'ajoute la cote que si absente (ré-exécution sûre)
        if (visuel.printFormat && !/cote client/i.test(doc.comment || "")) {
          set.comment = buildCoteClientComment(visuel.printFormat, doc.comment || "");
        }

        console.log(
          `  ${numCmd}/${doc.sousDossier} [${doc.status || "—"}] : ${j(doc.deco)} → ${j(set.deco)} | finition ${j(doc.finition)} → ${j(set.finition ?? doc.finition)} | format ${j(doc.format)} → ${j(set.format ?? doc.format)} | +surMesure/${set.surMesureKind || "?"}${set.orientation ? "/" + set.orientation : ""}${set.comment ? ` | comment ${j(set.comment)}` : ""}`,
        );

        if (APPLY) {
          try {
            await col.updateOne({ _id: doc._id }, { $set: set });
            resume.misAJour += 1;
          } catch (err) {
            resume.erreurs += 1;
            console.log(`    ! écriture échouée : ${err.message}`);
          }
        }
      }
    }
  } finally {
    await closeConnection(connection);
  }

  console.log(
    `\nRésumé : candidats=${resume.candidats} misAJour=${resume.misAJour} nonResolus=${resume.nonResolus} pasSurMesure=${resume.pasSurMesure} erreurs=${resume.erreurs}` +
      (APPLY ? "" : "  (DRY-RUN — relancer avec --apply pour écrire)"),
  );

  await client.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("Erreur fatale :", e);
  process.exit(1);
});
