const pLimit = require("p-limit");
const logger = require("../logger/logger");
const dossierService = require("../gamesys/services/dossierService");
const dbConfig = require("../gamesys/config/db");
const { closeConnection } = require("../gamesys/lib/db");
const ConsommationCommande = require("../models/ConsommationCommande");

async function backfillDateCommande({ concurrency = 5, dryRun = false } = {}) {
  const aTraiter = await ConsommationCommande.find(
    { dateCommande: { $exists: false } },
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
            const dateCommande = await dossierService.fetchDossierDate(connection, doc.numCmd);
            if (!dateCommande) {
              resume.introuvables += 1;
              return;
            }
            await ConsommationCommande.updateOne({ _id: doc._id }, { $set: { dateCommande } });
            resume.misAJour += 1;
          } catch (err) {
            resume.erreurs += 1;
            logger.warn(`backfillDateCommande: échec numCmd=${doc.numCmd} : ${err.message}`);
          }
        }),
      ),
    );
  } finally {
    await closeConnection(connection);
  }

  return resume;
}

module.exports = { backfillDateCommande };
