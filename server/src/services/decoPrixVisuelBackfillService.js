const logger = require("../logger/logger");
const dossierService = require("../gamesys/services/dossierService");
const dbConfig = require("../gamesys/config/db");
const { closeConnection } = require("../gamesys/lib/db");
const Deco = require("../models/Deco");
const { createBackfillProgressBar } = require("../utils/backfillProgressBar");
const {
  isVisualLabel,
  normalizeSearchText,
  getVisualReferenceFromEntete,
  extractOrientationHint,
  labelMatchesOrientation,
} = require("../gamesys/utils/reference");

// Retrouve le prix du visuel correspondant à un document Deco parmi les lignes fd_entete_devi déjà
// chargées pour son numCmd (une seule requête par numCmd, cf. backfillDecoPrixVisuel ci-dessous).
// Match direct sur la référence explicite du devis (endv_ref_client/endv_no_modele/...), sans passer
// par le matching stock (fs_stock) utilisé par getDossierDetail/buildVisualReferences — inutile ici
// puisqu'on dispose déjà de la référence résolue du document Deco (doc.ref), pas besoin de la
// redériver depuis le catalogue.
function matchPrixVisuel(enteteRows, { ref, deco, format, soleDoc = false, orientation = null }) {
  const visualRows = enteteRows.filter((row) => isVisualLabel(row.endv_identif || ""));
  const safeRef = ref ? String(ref).toUpperCase() : null;
  let matchedRow = null;

  if (safeRef) {
    matchedRow =
      visualRows.find((row) => String(getVisualReferenceFromEntete(row) || "").toUpperCase() === safeRef) || null;
  }

  if (!matchedRow && deco) {
    const normDeco = normalizeSearchText(deco);
    // Le nom descriptif du visuel se trouve dans endv_identif pour les références catalogue, mais
    // dans endv_ref_client pour les panneaux sur-mesure (ex: "ARCHE BEIGE") ou certaines gammes
    // (ex: "BAMBUSA") — endv_identif y est alors un libellé générique type "Format fini : ..." ou
    // "Panneau déco sur-mesure ...", identique pour plusieurs lignes d'un même numCmd (cas réel
    // constaté commandes 167500/167431). On cherche donc dans les deux champs.
    let candidates = visualRows.filter((row) => {
      const normLibelle = normalizeSearchText(row.endv_identif || "");
      const normRefClient = normalizeSearchText(getVisualReferenceFromEntete(row));
      return (
        (normLibelle && (normLibelle.includes(normDeco) || normDeco.includes(normLibelle))) ||
        (normRefClient && (normRefClient.includes(normDeco) || normDeco.includes(normRefClient)))
      );
    });

    // Plusieurs lignes peuvent partager le même nom de visuel mais représenter des formats/orientations
    // différents (ex: "JARDIN SECRET GAUCHE 100x255cm" vs "... 150x255cm", ou plusieurs orientations
    // sur-mesure "ARCHE BEIGE GAUCHE/CENTRE/DROIT" avec chacune leur format) — le format Deco (déjà
    // résolu via RefDeco au moment du job) permet de lever l'ambiguïté. Gamesys sépare les décimales
    // par '.', la saisie manuelle Mongo parfois par ',' (FR) : on aligne avant de comparer.
    if (candidates.length > 1 && format) {
      const normFormat = normalizeSearchText(String(format).replace(/,/g, "."));
      const narrowed = candidates.filter(
        (row) =>
          normalizeSearchText(row.endv_identif || "").includes(normFormat) ||
          normalizeSearchText(getVisualReferenceFromEntete(row)).includes(normFormat),
      );
      if (narrowed.length > 0) candidates = narrowed;
    }

    // Deux panneaux miroir (Gauche/Droit/Centre) du même visuel et même format peuvent avoir un prix
    // différent (cas réel : commande 166212, Hokusai Droit 283,51€ vs Gauche 557,35€). L'orientation
    // n'apparaît pas toujours dans deco, mais est parfois encodée en suffixe dans ref (ex:
    // "HOKUSAID-150210"/"HOKUSAIG-150210").
    if (candidates.length > 1) {
      const orient = orientation || extractOrientationHint(ref, deco);
      if (orient) {
        const narrowed = candidates.filter(
          (row) =>
            labelMatchesOrientation(row.endv_identif || "", orient) ||
            labelMatchesOrientation(getVisualReferenceFromEntete(row), orient),
        );
        if (narrowed.length > 0) candidates = narrowed;
      }
    }

    if (candidates[0]) matchedRow = candidates[0];
  }

  // Dossier avec un seul document Deco et une seule ligne visuel Gamesys : aucune ambiguïté à lever,
  // le prix de cette unique ligne EST le prix cherché même si le texte ne matche pas (cas réel
  // commande 167637 : deco="terrazzo gris" vs endv_identif="255x60cm TERRAZZO GR BEIGE (M)" — Gamesys
  // abrège/reformule différemment, mais il n'y a qu'une ligne possible). `soleDoc` doit être vrai
  // (un seul document Deco pour ce numCmd) pour éviter d'assigner le même prix aux deux visuels d'une
  // crédence BRICO/CASTO amalgamée (2 documents Deco partageant le même numCmd, cf. CLAUDE.md) si
  // Gamesys ne facture ce cas qu'avec une seule ligne de devis.
  if (!matchedRow && soleDoc && visualRows.length === 1) {
    matchedRow = visualRows[0];
  }

  if (!matchedRow) return undefined;
  // Prix lu directement sur la ligne matchée plutôt que re-résolu via getPrixForArticle par libellé
  // (endv_identif) : quand plusieurs lignes partagent le même libellé générique (cas BAMBUSA
  // ci-dessus), une re-résolution par libellé les additionnerait toutes au lieu de ne garder que
  // celle effectivement matchée.
  const prix = Number(matchedRow.endv_px_total);
  return Number.isFinite(prix) ? prix : undefined;
}

async function backfillDecoPrixVisuel({ dryRun = false, numCmds = null, sinceDate = null } = {}) {
  const filter = { prix: { $exists: false } };
  filter.numCmd = numCmds ? { $in: numCmds } : { $gt: 0 };
  if (sinceDate) filter.createdAt = { $gte: sinceDate };
  const aTraiter = await Deco.find(filter, { numCmd: 1, ref: 1, deco: 1, format: 1, orientation: 1 }).lean();

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
  logger.info(`backfillDecoPrixVisuel: ${aTraiter.length} candidat(s) à traiter (${byNumCmd.size} numCmd)`);
  const bar = createBackfillProgressBar("backfillDecoPrixVisuel", aTraiter.length);
  try {
    for (const [numCmd, docs] of byNumCmd.entries()) {
      let enteteRows;
      try {
        enteteRows = await dossierService.fetchEnteteDevis(connection, String(numCmd), null, null);
      } catch (err) {
        resume.erreurs += docs.length;
        logger.warn(`backfillDecoPrixVisuel: fetchEnteteDevis échoué pour numCmd=${numCmd} : ${err.message}`);
        bar.increment(docs.length, { ok: resume.misAJour, ko: resume.erreurs });
        continue;
      }

      for (const doc of docs) {
        try {
          const prix = matchPrixVisuel(enteteRows, {
            ref: doc.ref,
            deco: doc.deco,
            format: doc.format,
            soleDoc: docs.length === 1,
            orientation: doc.orientation,
          });
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
        } finally {
          bar.increment(1, { ok: resume.misAJour, ko: resume.erreurs });
        }
      }
    }
    bar.stop();
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
  const aTraiter = await Deco.find(filter, { numCmd: 1, ref: 1, deco: 1, format: 1, prix: 1, orientation: 1 }).lean();

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
          const prix = matchPrixVisuel(enteteRows, {
            ref: doc.ref,
            deco: doc.deco,
            format: doc.format,
            soleDoc: docs.length === 1,
            orientation: doc.orientation,
          });
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
