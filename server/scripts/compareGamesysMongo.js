/**
 * Script ponctuel : compare les références/visuels renvoyés par l'API gamesys (PostgreSQL/ODBC)
 * avec les références stockées dans MongoDB (RefDeco/RefCasto/RefBrico/RefEcom).
 * Usage : node server/scripts/compareGamesysMongo.js [limit]
 */
process.env.NODE_ENV = "development"; // force la base "Test" comme en dev, jamais la prod

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const { checkOdbcConnection } = require("../src/gamesys/config/db");
const dossierService = require("../src/gamesys/services/dossierService");
const { normalizeDossierApiPayload } = require("../src/controllers/dossierApiController");
const refModels = require("../src/services/refModels");
const { getSearchTerms } = require("../src/gamesys/utils/reference");

const CLIENT_NAME_TO_REF_MODEL = { LM: "LM", BM: "BRICO", CAS: "CASTO", ECOM: "ECOM" };

function normalizeFormat(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/cm$/i, "");
}

async function findMongoMatch(Model, visualJob) {
  if (visualJob.reference) {
    const exact = await Model.findOne({ ref: visualJob.reference }).lean();
    if (exact) return { doc: exact, matchType: "exact (ref)" };
  }
  if (visualJob.articleReference) {
    const exact = await Model.findOne({ ref: visualJob.articleReference }).lean();
    if (exact) return { doc: exact, matchType: "exact (articleReference)" };
  }

  const terms = getSearchTerms(visualJob.libelle);
  if (terms.length >= 2) {
    const regexes = terms.map((t) => new RegExp(t, "i"));
    const candidate = await Model.findOne({ $and: regexes.map((r) => ({ model: r })) }).lean();
    if (candidate) return { doc: candidate, matchType: "fuzzy (model contient les termes du libellé)" };
  }

  return { doc: null, matchType: "aucun" };
}

async function main() {
  const limit = parseInt(process.argv[2], 10) || 15;

  console.log(`NODE_ENV=${process.env.NODE_ENV} — connexion MongoDB (base "Test")...`);
  await connectMongo();
  if (mongoose.connection.readyState !== 1) {
    console.error("MongoDB indisponible, abandon.");
    process.exit(1);
  }

  console.log("Vérification de la connexion ODBC (gamesys/PostgreSQL)...");
  const odbcOk = await checkOdbcConnection();
  if (!odbcOk) {
    console.error("ODBC indisponible (DSN/réseau srv-bd). Impossible d'interroger gamesys depuis cette machine.");
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Récupération des ${limit} derniers dossiers gamesys...`);
  const dossiers = await dossierService.listDossiers({ limit });
  const rootNumeros = [...new Set(dossiers.map((d) => String(d.dos_no_cmde || "").split("/")[0]).filter(Boolean))];

  const report = [];

  for (const numero of rootNumeros) {
    let payload;
    try {
      payload = await dossierService.getDossierDetail({ numero, view: "summary" });
    } catch (error) {
      report.push({ numero, error: error.message });
      continue;
    }

    const normalized = normalizeDossierApiPayload(payload);
    const refModelKey = CLIENT_NAME_TO_REF_MODEL[payload.clientName] || null;
    const Model = refModelKey ? refModels[refModelKey] : null;

    for (const job of normalized.visualJobs) {
      if (!Model) {
        report.push({ numero, commande: job.commande, client: payload.clientName, error: "Client gamesys non mappé sur un modèle MongoDB" });
        continue;
      }

      const { doc, matchType } = await findMongoMatch(Model, job);
      const mongoFormat = doc ? doc.format : null;
      const formatCoherent = doc ? normalizeFormat(mongoFormat) === normalizeFormat(job.formatVisu) : null;

      report.push({
        numero,
        commande: job.commande,
        client: refModelKey,
        reference: job.reference,
        libelle: job.libelle,
        formatGamesys: job.formatVisu,
        matchType,
        mongoRef: doc?.ref || null,
        mongoModel: doc?.model || null,
        mongoFormat,
        formatCoherent,
      });
    }
  }

  console.log("\n=== Rapport de comparaison gamesys ↔ MongoDB ===\n");
  for (const row of report) {
    console.log(JSON.stringify(row));
  }

  const total = report.length;
  const noMatch = report.filter((r) => r.matchType === "aucun").length;
  const formatMismatch = report.filter((r) => r.formatCoherent === false).length;
  const errors = report.filter((r) => r.error).length;

  console.log(`\nTotal lignes : ${total} | Sans correspondance Mongo : ${noMatch} | Formats incohérents : ${formatMismatch} | Erreurs : ${errors}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error("Erreur fatale :", error);
  process.exit(1);
});
