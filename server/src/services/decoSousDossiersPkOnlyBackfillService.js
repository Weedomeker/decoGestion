const pLimit = require("p-limit");
const logger = require("../logger/logger");
const dossierService = require("../gamesys/services/dossierService");
const { computeSousDossiersPkOnly } = require("./decoStubService");
const Deco = require("../models/Deco");

// Peuple Deco.sousDossiers sur les stubs pkOnly existants (créés avant l'ajout de ce champ — voir
// profilsKitsService.js pour le peuplement à la création). Contrairement au backfill des documents
// visuel (decoSousDossierBackfillService.js), aucune jointure fs_stock n'est nécessaire ici : un
// seul appel getDossierDetail par document suffit pour retrouver, parmi ses sous-dossiers, ceux qui
// portent un profil ou un kit — même calcul que profilsKitsService.js à la création
// (computeSousDossiersPkOnly, decoStubService.js). Pas de dédup par numCmd : un stub pkOnly par
// numCmd (contrainte {numCmd, pkOnly:true} déjà en place à la création), donc pas plusieurs
// documents à traiter pour un même appel Gamesys comme pour le backfill visuel.
async function backfillDecoSousDossiersPkOnly({ concurrency = 5, dryRun = false } = {}) {
  const filter = { pkOnly: true, numCmd: { $gt: 0 }, sousDossiers: { $exists: false } };
  const aTraiter = await Deco.find(filter, { numCmd: 1 }).lean();

  const resume = { candidats: aTraiter.length, misAJour: 0, sansProfilNiKit: 0, erreurs: 0 };

  if (dryRun || aTraiter.length === 0) return resume;

  const limit = pLimit(concurrency);
  await Promise.all(
    aTraiter.map((doc) =>
      limit(async () => {
        try {
          const grouped = await dossierService.getDossierDetail({ commande: String(doc.numCmd), view: "summary" });
          const sousDossiers = computeSousDossiersPkOnly(grouped?.sousDossiers);
          if (!sousDossiers) {
            resume.sansProfilNiKit += 1;
            return;
          }
          await Deco.updateOne({ _id: doc._id }, { $set: { sousDossiers } });
          resume.misAJour += 1;
        } catch (err) {
          resume.erreurs += 1;
          logger.warn(`backfillDecoSousDossiersPkOnly: échec numCmd=${doc.numCmd} : ${err.message}`);
        }
      }),
    ),
  );

  return resume;
}

module.exports = { backfillDecoSousDossiersPkOnly };
