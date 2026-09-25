const pLimit = require("p-limit");
const logger = require("../logger/logger");
const dossierService = require("../gamesys/services/dossierService");
const dbConfig = require("../gamesys/config/db");
const { closeConnection } = require("../gamesys/lib/db");
const Deco = require("../models/Deco");

async function backfillDecoLivraisonDates({ concurrency = 5, dryRun = false, sinceDate = null } = {}) {
  const filter = {
    numCmd: { $gt: 0 },
    $or: [{ dateLivraisonSouhaitee: { $exists: false } }, { mag: { $exists: false } }],
  };
  if (sinceDate) filter.createdAt = { $gte: sinceDate };
  const aTraiter = await Deco.find(filter, { numCmd: 1, client: 1 }).lean();

  const resume = { candidats: aTraiter.length, misAJour: 0, introuvables: 0, erreurs: 0 };

  if (dryRun || aTraiter.length === 0) return resume;

  // Un même numCmd peut apparaître sur plusieurs documents Deco (crédences amalgamées, plusieurs
  // jobs sur la même commande) — tous partagent le même `client`. On déduplique pour ne faire
  // qu'un seul aller-retour Gamesys par numCmd, puis on applique le résultat à tous les documents.
  const numCmdClientMap = new Map();
  for (const doc of aTraiter) {
    if (!numCmdClientMap.has(doc.numCmd)) numCmdClientMap.set(doc.numCmd, doc.client);
  }

  // Une seule connexion ODBC réutilisée pour toute la boucle.
  const connection = await dbConfig.getDbConnection();
  try {
    const limit = pLimit(concurrency);
    await Promise.all(
      [...numCmdClientMap.entries()].map(([numCmd, client]) =>
        limit(async () => {
          try {
            const { dateLivraisonSouhaitee, magasin, ville, magasinRef, villeRef } =
              await dossierService.fetchDossierLivraisonDates(connection, numCmd);
            // mag = ville de livraison pour LM/CASTO/BRICO (repère magasin), nom du destinataire
            // pour ECOM (livraison directe au client final) — même règle que decoGamesysStubSyncService.
            // Repli fc_references (villeRef/magasinRef) pour les enseignes physiques quand ff_livraison
            // est vide (dossier trop récent pour avoir une ligne de livraison).
            const mag =
              client === "ECOM" ? magasin || ville : ville || magasin || villeRef || magasinRef;

            if (!dateLivraisonSouhaitee && !mag) {
              resume.introuvables += 1;
              return;
            }

            const $set = {};
            const updateConditions = [];
            if (dateLivraisonSouhaitee) {
              $set.dateLivraisonSouhaitee = dateLivraisonSouhaitee;
              updateConditions.push({ dateLivraisonSouhaitee: { $exists: false } });
            }
            if (mag) {
              $set.mag = mag;
              updateConditions.push({ mag: { $exists: false } });
            }

            const { modifiedCount } = await Deco.updateMany({ numCmd, $or: updateConditions }, { $set });
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
