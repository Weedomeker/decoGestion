/**
 * Script ponctuel de validation : compare, sur les lignes de devis Gamesys récentes, la
 * résolution de référence stock par le NOUVEAU chemin prioritaire 0
 * (fd_entete_devi.endv_orderline_seq_article = fs_stock.st_seq_compt) contre l'ANCIENNE cascade
 * floue (priorités 1 à 4 de findStockReferences : ref explicite, EAN, LIKE mots-clés, libellé
 * exact, model+format).
 *
 * Pour chaque ligne : findStockReferences est appelée deux fois —
 *   - telle quelle (priorité 0 active) ;
 *   - avec endv_orderline_seq_article forcé à 0 (cascade seule).
 * Le script logue le taux d'accord / désaccord sur la référence résolue et un échantillon de
 * divergences, pour éprouver la priorité 0 avant de s'y fier.
 *
 * Lecture seule côté Gamesys ET côté Mongo (findStockReferences ne fait que des findOne sur les
 * collections Ref*). Une seule connexion ODBC réutilisée, boucle séquentielle
 * (cf. feedback_odbc_backfill_resource_limits).
 *
 * Usage :
 *   node server/scripts/compareOrderlineResolution.js                  (30 jours, 300 lignes max)
 *   node server/scripts/compareOrderlineResolution.js --days=120 --limit=1000
 *   node server/scripts/compareOrderlineResolution.js --days=120 --limit=1000 --show=40
 *
 * Respecte NODE_ENV comme le reste de l'app : development -> Mongo "Test", sinon "DecoKin" (prod).
 * La comparaison ne dépend pas de la base Mongo (mêmes Ref* des deux côtés), "Test" suffit.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const dbConfig = require("../src/gamesys/config/db");
const { closeConnection } = require("../src/gamesys/lib/db");
const { findStockReferences } = require("../src/gamesys/services/dossierService");

function parseArgs(argv) {
  const args = { days: 30, limit: 300, show: 20 };
  for (const arg of argv) {
    const m = arg.match(/^--(days|limit|show)=(\d+)$/);
    if (m) args[m[1]] = parseInt(m[2], 10);
  }
  return args;
}

async function resolveFirstRef(connection, entete) {
  try {
    const refs = await findStockReferences(connection, [entete], null, null);
    return refs[0]?.reference || null;
  } catch (err) {
    return `__ERR__:${err.message}`;
  }
}

async function main() {
  const { days, limit, show } = parseArgs(process.argv.slice(2));

  console.log(`NODE_ENV=${process.env.NODE_ENV || "(non défini)"} — connexion MongoDB...`);
  await connectMongo();
  if (mongoose.connection.readyState !== 1) {
    console.error("MongoDB indisponible, abandon.");
    process.exit(1);
  }
  console.log(`Mongo "${mongoose.connection.name}". Fenêtre : ${days} j, ${limit} lignes max.\n`);

  const connection = await dbConfig.getDbConnection();
  const stats = {
    total: 0,
    withOrderline: 0,
    agree: 0,
    p0OnlyResolved: 0, // p0 trouve, cascade non
    cascadeOnlyResolved: 0, // cascade trouve, p0 non
    bothUnresolved: 0,
    disagree: 0,
  };
  const divergences = [];

  try {
    const rows = Array.from(
      await connection.query(
        `SELECT * FROM public.fd_entete_devi
         WHERE endv_date_cmde >= CURRENT_DATE - interval '${days} days'
         ORDER BY endv_date_cmde DESC, endv_no_commande DESC
         LIMIT ${limit}`,
      ),
    );

    for (const entete of rows) {
      stats.total += 1;
      const orderlineId = Number(entete.endv_orderline_seq_article) || 0;

      const p0 = await resolveFirstRef(connection, entete);
      const cascade = await resolveFirstRef(connection, { ...entete, endv_orderline_seq_article: 0 });

      if (orderlineId > 0) stats.withOrderline += 1;

      const p0ok = p0 && !String(p0).startsWith("__ERR__");
      const casOk = cascade && !String(cascade).startsWith("__ERR__");

      if (p0 === cascade) {
        stats.agree += 1;
      } else if (p0ok && !casOk) {
        stats.p0OnlyResolved += 1;
        divergences.push({ kind: "p0-only", entete, p0, cascade });
      } else if (!p0ok && casOk) {
        stats.cascadeOnlyResolved += 1;
        divergences.push({ kind: "cascade-only", entete, p0, cascade });
      } else if (!p0ok && !casOk) {
        stats.bothUnresolved += 1;
      } else {
        stats.disagree += 1;
        divergences.push({ kind: "disagree", entete, p0, cascade });
      }
    }
  } finally {
    await closeConnection(connection);
  }

  console.log("=== RÉSUMÉ ===");
  console.log(`  Lignes examinées                 : ${stats.total}`);
  console.log(`  avec endv_orderline_seq_article>0 : ${stats.withOrderline}`);
  console.log(`  Référence identique (p0 == cascade) : ${stats.agree}`);
  console.log(`  Résolue par p0 seul                : ${stats.p0OnlyResolved}`);
  console.log(`  Résolue par cascade seule          : ${stats.cascadeOnlyResolved}`);
  console.log(`  Non résolue des deux côtés         : ${stats.bothUnresolved}`);
  console.log(`  Désaccord (deux refs différentes)  : ${stats.disagree}`);

  const sample = divergences.slice(0, show);
  if (sample.length) {
    console.log(`\n=== DIVERGENCES (${sample.length}/${divergences.length}) ===`);
    for (const d of sample) {
      console.log(
        `[${d.kind}] cmd=${d.entete.endv_no_commande} oid=${d.entete.endv_orderline_seq_article} ` +
          `identif="${String(d.entete.endv_identif || "").slice(0, 50)}"\n` +
          `        p0=${d.p0}  cascade=${d.cascade}`,
      );
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error("Erreur fatale :", error);
  process.exit(1);
});
