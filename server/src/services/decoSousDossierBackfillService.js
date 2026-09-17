const pLimit = require("p-limit");
const logger = require("../logger/logger");
const dossierService = require("../gamesys/services/dossierService");
const dbConfig = require("../gamesys/config/db");
const { query, closeConnection } = require("../gamesys/lib/db");
const { normalizeSearchText, getSearchTerms } = require("../gamesys/utils/reference");
const Deco = require("../models/Deco");

// Résolution par JOINTURE GAMESYS PURE (méthode principale — aucun appel MongoDB) :
// 1. fs_stock est interrogée directement par égalité exacte sur st_art_ref_client/st_modele = ref
//    (une vraie jointure interne à Gamesys, pas une comparaison approximative).
// 2. Le(s) libellé(s) catalogue trouvé(s) (st_lib_1_conso/st_lib_2_conso) sont comparés par
//    recouvrement de termes (getSearchTerms/normalizeSearchText, même logique que
//    buildVisualReferences) à endv_identif de chaque ligne fd_entete_devi du dossier, pour
//    retrouver LA ligne — donc le sous-dossier — d'origine.
// Vérifié empiriquement sur 2 dossiers réels (167648 : 8/8 lignes redonnent bien leur sous-dossier
// via cette méthode dont 7/8 par jointure directe ; 165594 : 4/4) — contrairement au chemin
// findStockReferences (Priorité 3, repli MongoDB par modèle+format) qui peut renvoyer une
// référence différente de celle historiquement enregistrée sur Deco.ref si le catalogue Mongo a
// été renuméroté depuis (cas constaté sur 165594) : cette fonction n'appelle jamais MongoDB.
// Retourne null (pas de correspondance unique) plutôt que de deviner.
async function matchSousDossierViaJoin(connection, rows, ref) {
  if (!ref) return null;

  const stockRows = await query(
    connection,
    `select st_lib_1_conso, st_lib_2_conso
     from public.fs_stock
     where upper(st_art_ref_client) = upper(?) or upper(st_modele) = upper(?)`,
    [ref, ref],
  );
  if (stockRows.length === 0) return null;

  const stockTermSets = stockRows
    .map((s) => getSearchTerms([s.st_lib_1_conso, s.st_lib_2_conso].filter(Boolean).join(" ")))
    .filter((terms) => terms.length > 0);
  if (stockTermSets.length === 0) return null;

  const matches = (rows || []).filter((row) => {
    const identifText = normalizeSearchText(row.endv_identif);
    return stockTermSets.some((terms) => terms.every((t) => identifText.includes(t)));
  });

  const uniqueSousDossiers = [...new Set(matches.map((m) => String(m.endv_no_commande || "").split("/")[1]).filter(Boolean))];
  return uniqueSousDossiers.length === 1 ? uniqueSousDossiers[0] : null;
}

// Résolution par TEXTE (repli, aucun appel réseau supplémentaire — rows déjà en mémoire) : utilisée
// seulement quand la jointure ci-dessus ne trouve pas ref dans fs_stock, ou ne retrouve pas une
// ligne unique par recouvrement de termes (ex: libellé catalogue trop générique, cf. "Kit de pose").
// endv_no_commande et endv_identif sont sur la même ligne fd_entete_devi (vérifié empiriquement),
// endv_identif encode nom + format (ex: "ONYX GAUCHE 125x255cm"). Filtre d'abord par format
// (extractDimensionFormat), puis par nom si plusieurs sous-dossiers partagent le même format (ex:
// crédences amalgamées) — retourne null (ambigu) plutôt que de deviner si non unique.
function matchSousDossierViaTexte(rows, deco, format) {
  if (!format) return null;
  const candidatsFormat = (rows || []).filter(
    (row) => dossierService.extractDimensionFormat(row.endv_identif) === format,
  );
  if (candidatsFormat.length === 0) return null;

  let candidats = candidatsFormat;
  if (candidats.length > 1) {
    const decoTerms = getSearchTerms(deco);
    if (decoTerms.length) {
      const parNom = candidats.filter((row) => {
        const modelText = normalizeSearchText(dossierService.extractModelFromIdentif(row.endv_identif));
        return decoTerms.every((term) => modelText.includes(term));
      });
      if (parNom.length) candidats = parNom;
    }
  }
  if (candidats.length !== 1) return null;

  const suffixe = String(candidats[0].endv_no_commande || "").split("/")[1];
  return suffixe || null;
}

// Jointure Gamesys pure d'abord (la plus fiable — référence exacte via fs_stock, aucun MongoDB,
// donc aucun risque de dérive catalogue), texte en repli (peu coûteux, déjà en mémoire) si la
// jointure ne résout pas un candidat unique. `origine` dans le résultat sert à la télémétrie.
async function matchSousDossier(connection, rows, doc) {
  const viaJoin = await matchSousDossierViaJoin(connection, rows, doc.ref);
  if (viaJoin != null) return { sousDossier: viaJoin, origine: "jointure" };

  const viaTexte = matchSousDossierViaTexte(rows, doc.deco, doc.format);
  if (viaTexte != null) return { sousDossier: viaTexte, origine: "texte" };

  return { sousDossier: null, origine: null };
}

async function backfillDecoSousDossier({ concurrency = 5, dryRun = false } = {}) {
  const filter = { numCmd: { $gt: 0 }, ref: { $exists: true, $ne: null }, sousDossier: { $exists: false } };
  const aTraiter = await Deco.find(filter, { numCmd: 1, ref: 1, deco: 1, format: 1 }).lean();

  const resume = {
    candidats: aTraiter.length,
    misAJour: 0,
    resolusParJointure: 0,
    resolusParTexte: 0,
    ambigus: 0,
    erreurs: 0,
  };

  if (dryRun || aTraiter.length === 0) return resume;

  const byNumCmd = new Map();
  for (const doc of aTraiter) {
    if (!byNumCmd.has(doc.numCmd)) byNumCmd.set(doc.numCmd, []);
    byNumCmd.get(doc.numCmd).push(doc);
  }

  const connection = await dbConfig.getDbConnection();
  try {
    const limit = pLimit(concurrency);
    await Promise.all(
      [...byNumCmd.entries()].map(([numCmd, docs]) =>
        limit(async () => {
          try {
            const rows = await dossierService.fetchEnteteDevis(connection, String(numCmd), "", null);
            for (const doc of docs) {
              const { sousDossier, origine } = await matchSousDossier(connection, rows, doc);
              if (sousDossier == null) {
                resume.ambigus += 1;
                continue;
              }
              await Deco.updateOne({ _id: doc._id }, { $set: { sousDossier } });
              resume.misAJour += 1;
              if (origine === "jointure") resume.resolusParJointure += 1;
              else resume.resolusParTexte += 1;
            }
          } catch (err) {
            resume.erreurs += docs.length;
            logger.warn(`backfillDecoSousDossier: échec numCmd=${numCmd} : ${err.message}`);
          }
        }),
      ),
    );
  } finally {
    await closeConnection(connection);
  }

  return resume;
}

module.exports = { backfillDecoSousDossier, matchSousDossier, matchSousDossierViaJoin, matchSousDossierViaTexte };
