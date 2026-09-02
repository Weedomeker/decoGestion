const pLimit = require("p-limit");
const logger = require("../logger/logger");
const dossierService = require("../gamesys/services/dossierService");
const { isProfileLabel, isKitPoseLabel } = require("../gamesys/utils/reference");
const { getPrixForArticle } = require("./profilsKitsService");
const ConsommationCommande = require("../models/ConsommationCommande");
const { createBackfillProgressBar } = require("../utils/backfillProgressBar");

function predicateForType(type) {
  return type === "kit" ? isKitPoseLabel : isProfileLabel;
}

// Contrairement au backfill Deco.prixTotal (un seul champ scalaire), articles est un tableau de
// sous-documents — on reconstruit le tableau entier en ne touchant qu'aux articles sans prix
// (ref/type/libelle/quantite existants préservés tels quels), puis on écrit le tableau complet.
async function backfillConsommationPrix({ concurrency = 5, dryRun = false, sinceDate = null } = {}) {
  const filter = { articles: { $elemMatch: { prix: { $exists: false } } } };
  if (sinceDate) filter.createdAt = { $gte: sinceDate };
  const aTraiter = await ConsommationCommande.find(filter, { numCmd: 1, articles: 1 }).lean();

  const resume = { candidats: aTraiter.length, misAJour: 0, introuvables: 0, erreurs: 0 };

  if (dryRun || aTraiter.length === 0) return resume;

  const bar = createBackfillProgressBar("backfillConsommationPrix", aTraiter.length);
  const limit = pLimit(concurrency);
  await Promise.all(
    aTraiter.map((doc) =>
      limit(async () => {
        try {
          const grouped = await dossierService.getDossierDetail({ commande: String(doc.numCmd), view: "summary" });
          const sousDossiers = grouped?.sousDossiers || [];

          let changed = false;
          const updatedArticles = (doc.articles || []).map((article) => {
            if (article.prix !== undefined && article.prix !== null) return article;
            const predicate = predicateForType(article.type);
            const prix = getPrixForArticle(sousDossiers, predicate, article.libelle || "");
            if (prix === undefined) return article;
            changed = true;
            return { ...article, prix };
          });

          if (!changed) {
            resume.introuvables += 1;
            return;
          }

          await ConsommationCommande.updateOne({ _id: doc._id }, { $set: { articles: updatedArticles } });
          resume.misAJour += 1;
        } catch (err) {
          resume.erreurs += 1;
          logger.warn(`backfillConsommationPrix: échec numCmd=${doc.numCmd} : ${err.message}`);
        } finally {
          bar.increment(1, { ok: resume.misAJour, ko: resume.erreurs });
        }
      }),
    ),
  );
  bar.stop();

  return resume;
}

module.exports = { backfillConsommationPrix };
