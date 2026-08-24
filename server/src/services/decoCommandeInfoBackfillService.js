const pLimit = require("p-limit");
const logger = require("../logger/logger");
const dossierService = require("../gamesys/services/dossierService");
const dbConfig = require("../gamesys/config/db");
const { closeConnection } = require("../gamesys/lib/db");
const Deco = require("../models/Deco");

async function backfillDecoCommandeInfo({ concurrency = 5, dryRun = false, sinceDate = null } = {}) {
  const filter = { numCmd: { $gt: 0 }, dateCommande: { $exists: false } };
  if (sinceDate) filter.createdAt = { $gte: sinceDate };
  const aTraiter = await Deco.find(filter, { numCmd: 1 }).lean();

  const resume = { candidats: aTraiter.length, misAJour: 0, introuvables: 0, erreurs: 0 };

  if (dryRun || aTraiter.length === 0) return resume;

  // Un même numCmd peut apparaître sur plusieurs documents Deco — on déduplique pour ne faire
  // qu'un seul aller-retour Gamesys par numCmd, puis on applique le résultat à tous les documents.
  const numCmds = [...new Set(aTraiter.map((doc) => doc.numCmd))];

  const connection = await dbConfig.getDbConnection();
  try {
    const limit = pLimit(concurrency);
    await Promise.all(
      numCmds.map((numCmd) =>
        limit(async () => {
          try {
            const commandeInfo = await dossierService.fetchDossierCommandeInfo(connection, numCmd);
            if (commandeInfo == null) {
              resume.introuvables += 1;
              return;
            }
            const formatPlaqueGamesys = await dossierService.fetchDossierFormatPlaque(connection, numCmd);
            const { modifiedCount } = await Deco.updateMany(
              { numCmd, dateCommande: { $exists: false } },
              { $set: { ...commandeInfo, formatPlaqueGamesys } },
            );
            resume.misAJour += modifiedCount;
          } catch (err) {
            resume.erreurs += 1;
            logger.warn(`backfillDecoCommandeInfo: échec numCmd=${numCmd} : ${err.message}`);
          }
        }),
      ),
    );
  } finally {
    await closeConnection(connection);
  }

  return resume;
}

module.exports = { backfillDecoCommandeInfo };
