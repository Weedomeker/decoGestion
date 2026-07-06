const pLimit = require("p-limit");
const logger = require("../logger/logger");
const dossierService = require("../gamesys/services/dossierService");
const dbConfig = require("../gamesys/config/db");
const { closeConnection } = require("../gamesys/lib/db");
const ConsommationCommande = require("../models/ConsommationCommande");

async function backfillLivraisonDates({ concurrency = 5, dryRun = false } = {}) {
  const aTraiter = await ConsommationCommande.find(
    { $or: [{ dateDepartUsine: { $exists: false } }, { dateLivraisonSouhaitee: { $exists: false } }] },
    { numCmd: 1 },
  ).lean();

  const resume = { candidats: aTraiter.length, misAJour: 0, introuvables: 0, erreurs: 0 };

  if (dryRun || aTraiter.length === 0) return resume;

  // Une seule connexion ODBC réutilisée pour toute la boucle (évite d'ouvrir/fermer
  // une connexion par commande sur potentiellement des milliers de documents).
  const connection = await dbConfig.getDbConnection();
  try {
    const limit = pLimit(concurrency);
    await Promise.all(
      aTraiter.map((doc) =>
        limit(async () => {
          try {
            const { dateDepartUsine, dateLivraisonSouhaitee } = await dossierService.fetchDossierLivraisonDates(
              connection,
              doc.numCmd,
            );
            if (!dateDepartUsine && !dateLivraisonSouhaitee) {
              resume.introuvables += 1;
              return;
            }
            const set = {};
            if (dateDepartUsine) set.dateDepartUsine = dateDepartUsine;
            if (dateLivraisonSouhaitee) set.dateLivraisonSouhaitee = dateLivraisonSouhaitee;
            await ConsommationCommande.updateOne({ _id: doc._id }, { $set: set });
            resume.misAJour += 1;
          } catch (err) {
            resume.erreurs += 1;
            logger.warn(`backfillLivraisonDates: échec numCmd=${doc.numCmd} : ${err.message}`);
          }
        }),
      ),
    );
  } finally {
    await closeConnection(connection);
  }

  return resume;
}

module.exports = { backfillLivraisonDates };
