const logger = require("../logger/logger");
const dossierService = require("../gamesys/services/dossierService");
const dbConfig = require("../gamesys/config/db");
const { closeConnection } = require("../gamesys/lib/db");
const Deco = require("../models/Deco");
const {
  isVisualLabel,
  normalizeSearchText,
  getVisualReferenceFromEntete,
  extractOrientationHint,
  labelMatchesOrientation,
} = require("../gamesys/utils/reference");
const { getPrixForArticle } = require("./profilsKitsService");

// Retrouve le prix du visuel correspondant à un document Deco parmi les lignes fd_entete_devi déjà
// chargées pour son numCmd (une seule requête par numCmd, cf. backfillDecoPrixVisuel ci-dessous).
// Match direct sur la référence explicite du devis (endv_ref_client/endv_no_modele/...), sans passer
// par le matching stock (fs_stock) utilisé par getDossierDetail/buildVisualReferences — inutile ici
// puisqu'on dispose déjà de la référence résolue du document Deco (doc.ref), pas besoin de la
// redériver depuis le catalogue.
function matchPrixVisuel(enteteRows, { ref, deco, format }) {
  const visualRows = enteteRows.filter((row) => isVisualLabel(row.endv_identif || ""));
  const safeRef = ref ? String(ref).toUpperCase() : null;
  let matchedLibelle = null;

  if (safeRef) {
    const direct = visualRows.find((row) => String(getVisualReferenceFromEntete(row) || "").toUpperCase() === safeRef);
    if (direct) matchedLibelle = direct.endv_identif;
  }

  if (!matchedLibelle && deco) {
    const normDeco = normalizeSearchText(deco);
    let candidates = visualRows.filter((row) => {
      const normLibelle = normalizeSearchText(row.endv_identif || "");
      return normLibelle && (normLibelle.includes(normDeco) || normDeco.includes(normLibelle));
    });

    // Plusieurs lignes peuvent partager le même nom de visuel mais représenter des formats
    // différents (ex: "JARDIN SECRET GAUCHE 100x255cm" vs "... 150x255cm") — sans endv_ref_client
    // pour les départager, le format Deco (déjà résolu via RefDeco au moment du job) permet de
    // lever l'ambiguïté puisque le libellé Gamesys l'inclut généralement.
    if (candidates.length > 1 && format) {
      const normFormat = normalizeSearchText(format);
      const narrowed = candidates.filter((row) => normalizeSearchText(row.endv_identif || "").includes(normFormat));
      if (narrowed.length > 0) candidates = narrowed;
    }

    // Deux panneaux miroir (Gauche/Droit/Centre) du même visuel et même format peuvent avoir un prix
    // différent (cas réel : commande 166212, Hokusai Droit 283,51€ vs Gauche 557,35€). L'orientation
    // n'apparaît pas toujours dans deco, mais est parfois encodée en suffixe dans ref (ex:
    // "HOKUSAID-150210"/"HOKUSAIG-150210").
    if (candidates.length > 1) {
      const orientation = extractOrientationHint(ref, deco);
      if (orientation) {
        const narrowed = candidates.filter((row) => labelMatchesOrientation(row.endv_identif || "", orientation));
        if (narrowed.length > 0) candidates = narrowed;
      }
    }

    if (candidates[0]) matchedLibelle = candidates[0].endv_identif;
  }

  if (!matchedLibelle) return undefined;
  return getPrixForArticle([{ enteteDevis: enteteRows }], isVisualLabel, matchedLibelle);
}

async function backfillDecoPrixVisuel({ dryRun = false, numCmds = null } = {}) {
  const filter = { prix: { $exists: false } };
  filter.numCmd = numCmds ? { $in: numCmds } : { $gt: 0 };
  const aTraiter = await Deco.find(filter, { numCmd: 1, ref: 1, deco: 1, format: 1 }).lean();

  const resume = { candidats: aTraiter.length, misAJour: 0, introuvables: 0, erreurs: 0 };

  if (dryRun || aTraiter.length === 0) return resume;

  const byNumCmd = new Map();
  for (const doc of aTraiter) {
    if (!byNumCmd.has(doc.numCmd)) byNumCmd.set(doc.numCmd, []);
    byNumCmd.get(doc.numCmd).push(doc);
  }

  // Une seule connexion ODBC réutilisée pour tout le backfill (comme decoPrixBackfillService.js /
  // fetchDossierPrixTotal) — contrairement à getDossierDetail, qui ouvre une connexion neuve PAR
  // SOUS-DOSSIER (jusqu'à 6+ pour un seul numCmd) plus des jointures stock, et qui a fini par
  // saturer les ressources machine sur un run de plusieurs milliers de numCmd. fetchEnteteDevis
  // suffit : on n'a besoin que des lignes de devis, pas du matching catalogue stock.
  const connection = await dbConfig.getDbConnection();
  try {
    for (const [numCmd, docs] of byNumCmd.entries()) {
      let enteteRows;
      try {
        enteteRows = await dossierService.fetchEnteteDevis(connection, String(numCmd), null, null);
      } catch (err) {
        resume.erreurs += docs.length;
        logger.warn(`backfillDecoPrixVisuel: fetchEnteteDevis échoué pour numCmd=${numCmd} : ${err.message}`);
        continue;
      }

      for (const doc of docs) {
        try {
          const prix = matchPrixVisuel(enteteRows, { ref: doc.ref, deco: doc.deco, format: doc.format });
          if (prix == null) {
            resume.introuvables += 1;
            continue;
          }
          const { modifiedCount } = await Deco.updateOne(
            { _id: doc._id, prix: { $exists: false } },
            { $set: { prix } },
          );
          resume.misAJour += modifiedCount;
        } catch (err) {
          resume.erreurs += 1;
          logger.warn(`backfillDecoPrixVisuel: échec _id=${doc._id} (numCmd=${numCmd}) : ${err.message}`);
        }
      }
    }
  } finally {
    await closeConnection(connection);
  }

  return resume;
}

// Re-vérifie TOUS les documents Deco (prix déjà rempli ou non) et corrige ceux dont le prix stocké
// ne correspond plus au résultat du matching corrigé (désambiguïsation par format, cf.
// matchPrixVisuel) — nécessaire car une version antérieure du backfill sans cette désambiguïsation
// a pu écrire un prix incorrect quand un même nom de visuel existe en plusieurs formats sans
// endv_ref_client pour les distinguer (cas réel constaté sur la commande 167602).
async function repairDecoPrixVisuel({ dryRun = false, numCmds = null } = {}) {
  const filter = {};
  filter.numCmd = numCmds ? { $in: numCmds } : { $gt: 0 };
  const aTraiter = await Deco.find(filter, { numCmd: 1, ref: 1, deco: 1, format: 1, prix: 1 }).lean();

  const resume = { candidats: aTraiter.length, corriges: 0, misAJour: 0, inchanges: 0, introuvables: 0, erreurs: 0 };

  if (dryRun || aTraiter.length === 0) return resume;

  const byNumCmd = new Map();
  for (const doc of aTraiter) {
    if (!byNumCmd.has(doc.numCmd)) byNumCmd.set(doc.numCmd, []);
    byNumCmd.get(doc.numCmd).push(doc);
  }

  const connection = await dbConfig.getDbConnection();
  try {
    for (const [numCmd, docs] of byNumCmd.entries()) {
      let enteteRows;
      try {
        enteteRows = await dossierService.fetchEnteteDevis(connection, String(numCmd), null, null);
      } catch (err) {
        resume.erreurs += docs.length;
        logger.warn(`repairDecoPrixVisuel: fetchEnteteDevis échoué pour numCmd=${numCmd} : ${err.message}`);
        continue;
      }

      for (const doc of docs) {
        try {
          const prix = matchPrixVisuel(enteteRows, { ref: doc.ref, deco: doc.deco, format: doc.format });
          if (prix == null) {
            resume.introuvables += 1;
            continue;
          }
          if (doc.prix === prix) {
            resume.inchanges += 1;
            continue;
          }
          const eraitDejaRempli = doc.prix !== undefined && doc.prix !== null;
          await Deco.updateOne({ _id: doc._id }, { $set: { prix } });
          if (eraitDejaRempli) resume.corriges += 1;
          else resume.misAJour += 1;
        } catch (err) {
          resume.erreurs += 1;
          logger.warn(`repairDecoPrixVisuel: échec _id=${doc._id} (numCmd=${numCmd}) : ${err.message}`);
        }
      }
    }
  } finally {
    await closeConnection(connection);
  }

  return resume;
}

module.exports = { backfillDecoPrixVisuel, repairDecoPrixVisuel, matchPrixVisuel };
