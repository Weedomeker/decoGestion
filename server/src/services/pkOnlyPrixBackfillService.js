const logger = require("../logger/logger");
const Deco = require("../models/Deco");
const ConsommationCommande = require("../models/ConsommationCommande");
const { sumArticlesPrix } = require("./profilsKitsService");

// Peuple Deco.prixTotal pour les stubs "profils/kits seulement" (pkOnly: true) déjà en base, à
// partir des articles de la ConsommationCommande correspondante (même numCmd) — ces stubs n'ont pas
// de visuel, donc pas de Deco.prix possible, mais leur "prixTotal" est bien le total des
// profils/kits commandés. Purement Mongo-à-Mongo (aucun appel Gamesys), donc pas de souci de
// ressources contrairement aux backfills de prix par visuel.
async function backfillPkOnlyPrixTotal({ dryRun = false } = {}) {
  const stubs = await Deco.find({ pkOnly: true, prixTotal: { $exists: false } }, { numCmd: 1 }).lean();

  const resume = { candidats: stubs.length, misAJour: 0, introuvables: 0, erreurs: 0 };

  if (dryRun || stubs.length === 0) return resume;

  for (const stub of stubs) {
    try {
      const conso = await ConsommationCommande.findOne({ numCmd: stub.numCmd }, { articles: 1 }).lean();
      const prixTotal = sumArticlesPrix(conso?.articles);
      if (prixTotal == null) {
        resume.introuvables += 1;
        continue;
      }
      const { modifiedCount } = await Deco.updateOne(
        { _id: stub._id, prixTotal: { $exists: false } },
        { $set: { prixTotal } },
      );
      resume.misAJour += modifiedCount;
    } catch (err) {
      resume.erreurs += 1;
      logger.warn(`backfillPkOnlyPrixTotal: échec _id=${stub._id} (numCmd=${stub.numCmd}) : ${err.message}`);
    }
  }

  return resume;
}

module.exports = { backfillPkOnlyPrixTotal };
