const logger = require("../logger/logger");
const dossierService = require("../gamesys/services/dossierService");
const dbConfig = require("../gamesys/config/db");
const { closeConnection } = require("../gamesys/lib/db");
const Deco = require("../models/Deco");

// Re-renseigne Deco.finition des panneaux SUR-MESURE avec le vernis Mat / Brillant
// (dos_imp_1_fac_p_1 côté Gamesys, via dossierService.fetchDossierVernis) au lieu de la texture
// du gabarit ("Lisse"/"Texturée"/"Brossé"/"Couleur") ou d'une valeur historique à la casse
// incohérente ("mat"/"MAT"). Ne touche QUE les documents surMesure:true, et n'écrit que si le
// vernis résolu diffère de la valeur stockée. Volume attendu faible (quelques dizaines de docs) :
// boucle séquentielle, une seule connexion ODBC réutilisée (cf. feedback_odbc_backfill_resource_limits).
async function backfillSmesFinition({ dryRun = false, sinceDate = null } = {}) {
  const filter = { surMesure: true };
  if (sinceDate) filter.createdAt = { $gte: sinceDate };
  const aTraiter = await Deco.find(filter, { numCmd: 1, sousDossier: 1, finition: 1 }).lean();

  const resume = { candidats: aTraiter.length, misAJour: 0, inchanges: 0, introuvables: 0, erreurs: 0 };
  if (aTraiter.length === 0) return resume;

  const connection = await dbConfig.getDbConnection();
  try {
    for (const doc of aTraiter) {
      try {
        if (!doc.numCmd) {
          resume.introuvables += 1;
          continue;
        }
        const vernis = await dossierService.fetchDossierVernis(connection, doc.numCmd, doc.sousDossier);
        if (!vernis) {
          resume.introuvables += 1;
          continue;
        }
        if (doc.finition === vernis) {
          resume.inchanges += 1;
          continue;
        }
        if (dryRun) {
          resume.misAJour += 1;
          continue;
        }
        const { modifiedCount } = await Deco.updateOne({ _id: doc._id }, { $set: { finition: vernis } });
        resume.misAJour += modifiedCount;
      } catch (err) {
        resume.erreurs += 1;
        logger.warn(
          `backfillSmesFinition: échec _id=${doc._id} (numCmd=${doc.numCmd}/${doc.sousDossier || ""}) : ${err.message}`,
        );
      }
    }
  } finally {
    await closeConnection(connection);
  }

  return resume;
}

module.exports = { backfillSmesFinition };
