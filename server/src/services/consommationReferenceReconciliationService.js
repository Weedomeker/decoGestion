const logger = require("../logger/logger");
const dossierService = require("../gamesys/services/dossierService");
const { isNumericReference } = require("../gamesys/utils/reference");
const ConsommationCommande = require("../models/ConsommationCommande");

function resolveRef(r) {
  return r.reference || r.articleReference || r.modele || r.libelle;
}

// Corrige les articles de consommations_commandes dont la ref n'est pas numérique (fallback
// vers le libellé brut faute de correspondance stock au moment de saveProfilsKits — cas des
// cornières avant le fix de getProfileSearchTerms) en rejouant getDossierDetail sur Gamesys.
async function reconcileConsommationReferences({ dryRun = false } = {}) {
  const commandesAvecRefsCassees = await ConsommationCommande.aggregate([
    { $match: { "articles.ref": { $not: /^\d+$/ } } },
    { $project: { numCmd: 1, _id: 0 } },
  ]);

  let articlesCorriges = 0;
  const details = [];

  for (const { numCmd } of commandesAvecRefsCassees) {
    let grouped;
    try {
      grouped = await dossierService.getDossierDetail({ commande: String(numCmd), view: "summary" });
    } catch (err) {
      logger.warn(`reconcileConsommationReferences: getDossierDetail échoué pour cmd=${numCmd} : ${err.message}`);
      continue;
    }

    const freshRefsByLibelle = new Map(
      [...(grouped.profileReferences || []), ...(grouped.kitPosesReferences || [])].map((r) => [r.libelle, resolveRef(r)]),
    );

    for (const [libelle, freshRef] of freshRefsByLibelle) {
      if (!freshRef || !isNumericReference(freshRef)) continue;

      details.push({ numCmd, libelle, nouveauRef: freshRef });
      if (!dryRun) {
        await ConsommationCommande.updateOne(
          { numCmd, "articles.libelle": libelle, "articles.ref": { $not: /^\d+$/ } },
          { $set: { "articles.$.ref": freshRef } },
        );
        articlesCorriges += 1;
      }
    }
  }

  return {
    commandesAnalysees: commandesAvecRefsCassees.length,
    articlesCorrigeables: details.length,
    articlesCorriges,
    details,
  };
}

module.exports = { reconcileConsommationReferences };
