const pLimit = require("p-limit");
const logger = require("../logger/logger");
const dossierService = require("../gamesys/services/dossierService");
const dbConfig = require("../gamesys/config/db");
const { closeConnection } = require("../gamesys/lib/db");
const Deco = require("../models/Deco");

async function backfillDecoLivraisonDates({ concurrency = 5, dryRun = false } = {}) {
  const aTraiter = await Deco.find(
    { numCmd: { $gt: 0 }, dateLivraisonSouhaitee: { $exists: false } },
    { numCmd: 1 },
  ).lean();

  const resume = { candidats: aTraiter.length, misAJour: 0, introuvables: 0, erreurs: 0 };

  if (dryRun || aTraiter.length === 0) return resume;

  // Un même numCmd peut apparaître sur plusieurs documents Deco (crédences amalgamées avec
  // cmd/cmd2 identiques, plusieurs jobs sur la même commande) — contrairement à
  // ConsommationCommande qui a un index unique sur numCmd. On déduplique pour ne faire qu'un
  // seul aller-retour Gamesys par numCmd, puis on applique le résultat à tous les documents.
  const numCmds = [...new Set(aTraiter.map((doc) => doc.numCmd))];

  // Une seule connexion ODBC réutilisée pour toute la boucle.
  const connection = await dbConfig.getDbConnection();
  try {
    const limit = pLimit(concurrency);
    await Promise.all(
      numCmds.map((numCmd) =>
        limit(async () => {
          try {
            const { dateLivraisonSouhaitee } = await dossierService.fetchDossierLivraisonDates(connection, numCmd);
            if (!dateLivraisonSouhaitee) {
              resume.introuvables += 1;
              return;
            }
            const { modifiedCount } = await Deco.updateMany(
              { numCmd, dateLivraisonSouhaitee: { $exists: false } },
              { $set: { dateLivraisonSouhaitee } },
            );
            resume.misAJour += modifiedCount;
          } catch (err) {
            resume.erreurs += 1;
            logger.warn(`backfillDecoLivraisonDates: échec numCmd=${numCmd} : ${err.message}`);
          }
        }),
      ),
    );
  } finally {
    await closeConnection(connection);
  }

  return resume;
}

module.exports = { backfillDecoLivraisonDates };
