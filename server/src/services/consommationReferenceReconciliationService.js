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
async function reconcileConsommationReferences({ dryRun = false, excludeLibelles = [] } = {}) {
  // $elemMatch (et non "articles.ref": {$not}) : ce dernier exige que TOUS les éléments du
  // tableau échouent au test, donc ignore silencieusement les documents mélangeant des articles
  // déjà corrects et des articles encore cassés — le cas le plus courant en pratique.
  const commandesAvecRefsCassees = await ConsommationCommande.find(
    { articles: { $elemMatch: { ref: { $not: /^\d+$/ } } } },
    { numCmd: 1, _id: 0 },
  ).lean();

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
      if (excludeLibelles.includes(libelle)) continue;
      if (!freshRef || !isNumericReference(freshRef)) continue;

      details.push({ numCmd, libelle, nouveauRef: freshRef });
      if (!dryRun) {
        // $elemMatch obligatoire ici : sans lui, "articles.libelle" et "articles.ref" sont deux
        // conditions indépendantes sur le même tableau — Mongo ne garantit alors pas que
        // l'opérateur positionnel $ cible le même élément, et l'écriture peut silencieusement
        // ne rien modifier (cas observé en pratique sur des documents à plusieurs articles).
        const result = await ConsommationCommande.updateOne(
          { numCmd, articles: { $elemMatch: { libelle, ref: { $not: /^\d+$/ } } } },
          { $set: { "articles.$.ref": freshRef } },
        );
        if (result.modifiedCount) articlesCorriges += 1;
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
