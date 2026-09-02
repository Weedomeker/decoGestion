const pLimit = require("p-limit");
const logger = require("../logger/logger");
const dossierService = require("../gamesys/services/dossierService");
const dbConfig = require("../gamesys/config/db");
const { closeConnection } = require("../gamesys/lib/db");
const Deco = require("../models/Deco");
const { createBackfillProgressBar } = require("../utils/backfillProgressBar");

async function backfillDecoCommandeInfo({
  concurrency = 5,
  dryRun = false,
  sinceDate = null,
  synthese = null,
} = {}) {
  const filter = { numCmd: { $gt: 0 }, dateCommande: { $exists: false } };
  if (sinceDate) filter.createdAt = { $gte: sinceDate };
  const aTraiter = await Deco.find(filter, { numCmd: 1 }).lean();

  const resume = { candidats: aTraiter.length, misAJour: 0, introuvables: 0, erreurs: 0 };

  if (dryRun || aTraiter.length === 0) return resume;

  // Un même numCmd peut apparaître sur plusieurs documents Deco — on déduplique pour ne faire
  // qu'un seul aller-retour Gamesys par numCmd, puis on applique le résultat à tous les documents.
  const numCmds = [...new Set(aTraiter.map((doc) => doc.numCmd))];

  const connection = await dbConfig.getDbConnection();
  const bar = createBackfillProgressBar("backfillDecoCommandeInfo", numCmds.length);
  try {
    const limit = pLimit(concurrency);
    await Promise.all(
      numCmds.map((numCmd) =>
        limit(async () => {
          try {
            // Synthèse commandes prioritaire : si le numCmd y figure, aucun aller-retour Gamesys.
            // Quand la synthèse porte la ligne mais dateCommande null, elle fait autorité → introuvable.
            // La synthèse expose `codeClientGamesys` ; le $set écrit historiquement `codeClient`.
            let commandeInfo;
            let formatPlaqueGamesys;
            const s = synthese && synthese.get(numCmd);
            if (s) {
              if (s.dateCommande == null) {
                resume.introuvables += 1;
                return;
              }
              commandeInfo = {
                dateCommande: s.dateCommande,
                codeClient: s.codeClientGamesys ?? null,
                refClient: s.refClient ?? null,
                nombreProfil: s.nombreProfil ?? 0,
                nombreKitPose: s.nombreKitPose ?? 0,
                prixTotal: s.prixTotal ?? null,
              };
              formatPlaqueGamesys = s.formatPlaqueGamesys ?? null;
            } else {
              commandeInfo = await dossierService.fetchDossierCommandeInfo(connection, numCmd);
              if (commandeInfo == null) {
                resume.introuvables += 1;
                return;
              }
              formatPlaqueGamesys = await dossierService.fetchDossierFormatPlaque(connection, numCmd);
            }
            const { modifiedCount } = await Deco.updateMany(
              { numCmd, dateCommande: { $exists: false } },
              { $set: { ...commandeInfo, formatPlaqueGamesys } },
            );
            resume.misAJour += modifiedCount;
          } catch (err) {
            resume.erreurs += 1;
            logger.warn(`backfillDecoCommandeInfo: échec numCmd=${numCmd} : ${err.message}`);
          } finally {
            bar.increment(1, { ok: resume.misAJour, ko: resume.erreurs });
          }
        }),
      ),
    );
    bar.stop();
  } finally {
    await closeConnection(connection);
  }

  return resume;
}

module.exports = { backfillDecoCommandeInfo };
