const { getDbConnection } = require("../config/db");
const { query, sqlTextList, escapeSqlLike, closeConnection } = require("../lib/db");
const logger = require("../../logger/logger");
const {
  normalizeSearchText,
  getSearchTerms,
  getProfileSearchTerms,
  isProfileLabel,
  isKitPoseLabel,
  isNumericReference,
  getVisualReferenceFromEntete,
} = require("../utils/reference");
const {
  isSurMesureLabel,
  parseSurMesureGabarit,
  parseSurMesureRefClient,
  classifySurMesure,
} = require("../utils/surMesure");
const { cleanDbValue, pickFields, uniqueBy, countRows } = require("../utils/data");
const {
  deduceAppClientFromCatalogue,
  recoverCandidatesFromCatalogue,
  mergeCandidates,
} = require("../utils/clientCatalogue");
const { loadFamilleByLabel } = require("./stockReferenceLookupService");
const RefDeco  = require("../../models/RefDeco");
const RefEcom  = require("../../models/RefEcom");
const RefBrico = require("../../models/RefBrico");
const RefCasto = require("../../models/RefCasto");

// Récupération des commandes des comptes sans préfixe enseigne (PRO###, EPROCB, I96, ...) par
// la famille catalogue de leurs articles — cf. server/src/gamesys/utils/clientCatalogue.js.
// Activée par défaut ; GAMESYS_CATALOGUE_RECOVERY=false pour couper.
const CATALOGUE_RECOVERY = process.env.GAMESYS_CATALOGUE_RECOVERY !== "false";

// Mapping dos_client (Gamesys) → collection MongoDB préférée pour la résolution des références
const CLIENT_REF_MODEL = { LM: RefDeco, CAS: RefCasto, BM: RefBrico, ECOM: RefEcom };

function getPreferredRefModel(dosClient) {
  const key = String(dosClient || "").toUpperCase();
  for (const prefix of Object.keys(CLIENT_REF_MODEL)) {
    if (key.startsWith(prefix)) return CLIENT_REF_MODEL[prefix];
  }
  return null;
}

// Mapping dos_client (Gamesys) → enum client applicatif (ConsommationCommande.client)
const CLIENT_APP_NAME = { LM: "LM", CAS: "CASTO", BM: "BRICO", ECOM: "ECOM" };

function mapDosClientToAppClient(dosClient) {
  const key = String(dosClient || "").toUpperCase();
  for (const prefix of Object.keys(CLIENT_APP_NAME)) {
    if (key.startsWith(prefix)) return CLIENT_APP_NAME[prefix];
  }
  return null;
}

function mapStockRow(row) {
  return {
    reference: row.st_art_ref_client || row.st_modele,
    modele: row.st_modele,
    libelle: [row.st_lib_1_conso, row.st_lib_2_conso].filter(Boolean).join(" - "),
    gencod: row.st_art_gencod,
    codeTarif: row.st_code_tarif,
    famille: row.st_art_famille,
    sousFamille: row.st_art_sfamille,
    type: row.st_type,
    source: "fs_stock",
  };
}

const STOCK_SELECT = `
  select
    st_seq,
    st_seq_compt,
    st_modele,
    st_art_ref_client,
    st_lib_1_conso,
    st_lib_2_conso,
    st_art_gencod,
    st_code_tarif,
    st_art_famille,
    st_art_sfamille,
    st_type
  from public.fs_stock
`;

async function findMongoRef(ref) {
  const [deco, ecom, brico, casto] = await Promise.all([
    RefDeco.findOne({ ref }).lean().catch(() => null),
    RefEcom.findOne({ ref }).lean().catch(() => null),
    RefBrico.findOne({ ref }).lean().catch(() => null),
    RefCasto.findOne({ ref }).lean().catch(() => null),
  ]);
  return deco || ecom || brico || casto || null;
}

function extractDimensionFormat(text) {
  const m = String(text || "").match(/(\d{2,4})\s*x\s*(\d{2,4})/i);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return `${w > 500 ? Math.round(w / 10) : w}x${h > 500 ? Math.round(h / 10) : h}`;
}

function extractModelFromIdentif(identif) {
  // Retire les dimensions (NNNxNNNcm) pour isoler le nom du modèle
  return String(identif || "")
    .replace(/\s*\d{2,4}\s*x\s*\d{2,4}\s*(?:cm|mm)?\b\.?\s*/gi, " ")
    .trim();
}

// Résout {model, format} sur plusieurs collections Mongo en tenant compte de la finition connue
// (Mat/Brillant) quand elle est disponible — évite de trancher arbitrairement entre deux documents
// qui ne diffèrent que par leur finition (seul `ref` est unique dans les schémas Ref*, donc
// `model`+`format` peuvent légitimement matcher plusieurs SKUs). Repli sur le 1er document trouvé
// (comportement historique) si aucun ne correspond à la finition demandée.
async function findRefByModelFormat(orderedModels, mongoQuery, printFinish) {
  const docsPerModel = await Promise.all(orderedModels.map((m) => m.find(mongoQuery).lean().catch(() => [])));
  const allDocs = docsPerModel.flat();
  if (printFinish) {
    const matching = allDocs.find((d) => normalizeSearchText(d.finition || "").includes(printFinish));
    if (matching) return matching;
  }
  return allDocs[0] || null;
}

async function enrichRowsWithMongoRef(rows, identif, preferredRefModel, printFinish) {
  const format = extractDimensionFormat(identif);
  const model = extractModelFromIdentif(identif);
  const allModels = [RefDeco, RefEcom, RefBrico, RefCasto];
  // Réordonner : collection client en premier, les autres après
  const orderedModels = preferredRefModel
    ? [preferredRefModel, ...allModels.filter((m) => m !== preferredRefModel)]
    : allModels;

  return Promise.all(
    rows.map(async (row) => {
      // Court-circuitage uniquement si st_art_ref_client est valide dans la collection du client.
      // Si la ref est dans une autre collection (ex: TRZTER-100210 dans RefEcom pour un dossier LM),
      // on continue vers le lookup model+format pour trouver la ref de la bonne collection.
      if (row.st_art_ref_client) {
        const preferredMatch = preferredRefModel
          ? await preferredRefModel.findOne({ ref: row.st_art_ref_client }).lean().catch(() => null)
          : await findMongoRef(row.st_art_ref_client);
        if (preferredMatch) return row;
      }
      // st_art_ref_client absent/non trouvé : certaines gammes (crédences CASTO notamment, vérifié
      // en prod commande 167727 "IDCUI24-029" absent du catalogue mais son gencod "3664711433747"
      // y est bien présent) indexent le catalogue interne par gencod plutôt que par ref_client —
      // même court-circuitage si ce gencod valide, en le substituant comme référence retenue (même
      // idiome que le remplacement par mongoDoc.ref ci-dessous).
      if (row.st_art_gencod) {
        const gencodMatch = preferredRefModel
          ? await preferredRefModel.findOne({ ref: row.st_art_gencod }).lean().catch(() => null)
          : await findMongoRef(row.st_art_gencod);
        if (gencodMatch) return { ...row, st_art_ref_client: row.st_art_gencod, st_modele: row.st_art_gencod };
      }
      // st_art_ref_client/gencod absents ou non trouvés dans la collection client → chercher par model + format
      if (!model) return row;
      const q = format ? { model, format } : { model };
      const mongoDoc = await findRefByModelFormat(orderedModels, q, printFinish);
      return mongoDoc ? { ...row, st_art_ref_client: mongoDoc.ref, st_modele: mongoDoc.ref } : row;
    })
  );
}

async function findStockReferences(connection, enteteDevis, preferredRefModel, printFinish) {
  const identif = enteteDevis[0]?.endv_identif || "";

  // Priorité 0 : lien structurel direct ligne de devis -> article stock. FK déterministe
  // (fd_entete_devi.endv_orderline_seq_article = fs_stock.st_seq_compt), vérifié 99,96 % de
  // résolution sur 12 mois, st_seq_compt unique côté stock, indexé (fs_stock_st_seq_compt_idx).
  // Court-circuite toute la cascade floue ci-dessous (priorités 1 à 4 : ref explicite validée,
  // EAN, LIKE mots-clés, libellé exact, model+format) dès que l'identifiant est présent (>0) et
  // résout une ligne — y compris pour les crédences CASTO/BRICO, les visuels ECOM et le
  // sur-mesure (st_art_sfamille='SMES'). Repli sur la cascade pour les ~7 % de lignes sans
  // identifiant (promos, lots, transport) ou non résolues.
  const orderlineId = Number(enteteDevis[0]?.endv_orderline_seq_article) || 0;
  if (orderlineId > 0) {
    const rows = await query(connection, `${STOCK_SELECT} where st_seq_compt = ?`, [orderlineId]);
    if (rows.length > 0) {
      const enriched = await enrichRowsWithMongoRef(rows, identif, preferredRefModel, printFinish);
      return enriched.map((row) => ({ ...mapStockRow(row), source: "fs_stock_orderline" }));
    }
  }

  if (isKitPoseLabel(identif)) {
    const rows = await query(
      connection,
      `${STOCK_SELECT} where st_code_tarif = 'KITPOSE' order by st_seq desc limit 25`
    );
    return rows.map(mapStockRow);
  }

  // Priorité 1 : correspondance directe via les champs de référence explicites du devis
  // Validation croisée MongoDB + libellé stock pour éviter les fausses correspondances
  // (endv_ref_client peut contenir une référence d'un autre article, ex : ancienne commande LM)
  const directRefs = enteteDevis
    .map((e) => getVisualReferenceFromEntete(e))
    .filter(Boolean)
    .map((ref) => String(ref).trim().toUpperCase());

  if (directRefs.length > 0) {
    const identifAlphaTerms = getSearchTerms(identif).filter((t) => /^[A-Z]{3,}$/.test(t));

    const validatedRefs = (
      await Promise.all(
        directRefs.map(async (ref) => {
          const mongoDoc = await findMongoRef(ref);
          if (mongoDoc) {
            if (identifAlphaTerms.length === 0) return ref;
            const mongoModel = normalizeSearchText(mongoDoc.model || "");
            return identifAlphaTerms.some((t) => mongoModel.includes(t)) ? ref : null;
          }
          return null; // Inconnu de MongoDB → ref non fiable (peut être une ancienne commande), laisser Priorité 3 trouver la bonne
        })
      )
    ).filter(Boolean);

    if (validatedRefs.length > 0) {
      const validRefsText = sqlTextList(validatedRefs);
      const rows = await query(
        connection,
        `${STOCK_SELECT} where upper(st_art_ref_client) in (${validRefsText}) or upper(st_modele) in (${validRefsText}) order by st_seq desc limit 25`
      );
      if (rows.length > 0) {
        const confirmedRows =
          identifAlphaTerms.length === 0
            ? rows
            : rows.filter((row) => {
                const stockText = normalizeSearchText(
                  [row.st_lib_1_conso, row.st_lib_2_conso, row.st_modele].filter(Boolean).join(" ")
                );
                return identifAlphaTerms.some((t) => stockText.includes(t));
              });
        if (confirmedRows.length > 0) return (await enrichRowsWithMongoRef(confirmedRows, identif, preferredRefModel, printFinish)).map(mapStockRow);
        // La confirmation textuelle échoue mais la ref directe existe dans Gamesys → plus fiable que Priorité 3
        return (await enrichRowsWithMongoRef(rows, identif, preferredRefModel, printFinish)).map(mapStockRow);
      }
    }
  }

  // Priorité 2 : EAN/gencod (nombre de 13 chiffres dans le libellé)
  const eanMatch = identif.match(/\b(\d{13})\b/);
  if (eanMatch) {
    const rows = await query(
      connection,
      `${STOCK_SELECT} where st_art_gencod = ? order by st_seq desc limit 5`,
      [eanMatch[1]]
    );
    if (rows.length > 0) return (await enrichRowsWithMongoRef(rows, identif, preferredRefModel, printFinish)).map(mapStockRow);
  }

  // Priorité 3 (profils) : recherche LIKE textuelle inchangée — hors scope du fix référence visuelle.
  if (isProfileLabel(identif)) {
    const terms = getProfileSearchTerms(identif);
    const usefulTerms = terms.filter(Boolean).filter((term) => !["CM", "MM"].includes(term));

    if (usefulTerms.length < 2) return [];

    // upper() ne désaccentue pas : les termes de recherche sont désaccentués par
    // normalizeSearchText (ex: "PROFILE") mais certains libellés stock legacy conservent
    // l'accent ("Profilé de finition..."), ce qui les fait échouer silencieusement au LIKE.
    // translate() neutralise les voyelles/cédille accentuées des deux côtés de la comparaison.
    const unaccentUpper = (col) => `translate(upper(${col}), 'ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ', 'AAAEEEEIIOOUUUC')`;
    const likeParams = [];
    const where = usefulTerms
      .map((term) => {
        const likeVal = `%${escapeSqlLike(term)}%`;
        likeParams.push(likeVal, likeVal, likeVal, likeVal, likeVal);
        return `(${unaccentUpper("st_lib_1_conso")} like ? ESCAPE '\\' or ${unaccentUpper("st_lib_2_conso")} like ? ESCAPE '\\' or ${unaccentUpper("st_art_ref_client")} like ? ESCAPE '\\' or ${unaccentUpper("st_modele")} like ? ESCAPE '\\' or ${unaccentUpper("st_code_tarif")} like ? ESCAPE '\\')`;
      })
      .join(" and ");

    const rows = await query(
      connection,
      `${STOCK_SELECT} where ${where} order by st_seq desc limit 25`,
      likeParams
    );

    const exactRows = rows.filter((row) => {
      const haystack = normalizeSearchText([
        row.st_lib_1_conso,
        row.st_lib_2_conso,
        row.st_art_ref_client,
        row.st_code_tarif,
      ].filter(Boolean).join(" "));
      return terms.every((term) => haystack.includes(term));
    });

    return (await enrichRowsWithMongoRef(exactRows, identif, preferredRefModel, printFinish)).map(mapStockRow);
  }

  // Priorité 3bis (visuels) : correspondance EXACTE (pas de LIKE) sur le libellé stock
  // (st_lib_1_conso = identif, insensible à la casse) — comble un trou où endv_ref_client est vide
  // et aucun EAN n'est intégré dans identif (cas réel : crédences CASTO/BRICO, plusieurs articles
  // ECOM), alors que fs_stock porte pourtant la ligne exacte avec le bon gencod/ref_client (vérifié
  // en prod : commande CASTO 167727 "300x60cm BETON CLAIR (M)" -> st_art_gencod "3664711433747" ;
  // commande ECOM 167725 "Jaspe Gauche 100 x 210 cm (M)" -> st_art_ref_client "JASPEG-100210" —
  // les deux confirmés présents et corrects dans RefCasto/RefEcom). Stricte égalité de libellé
  // uniquement (pas de LIKE) pour ne pas réintroduire la recherche approximative volontairement
  // évitée pour les visuels (cf. priorité suivante).
  const exactLabelRows = await query(
    connection,
    `${STOCK_SELECT} where upper(st_lib_1_conso) = upper(?) order by st_seq desc limit 5`,
    [identif]
  );
  if (exactLabelRows.length > 0) {
    return (await enrichRowsWithMongoRef(exactLabelRows, identif, preferredRefModel, printFinish)).map(mapStockRow);
  }

  // Priorité 4 (visuels) : lookup MongoDB direct par {model, format} — pas de recherche
  // approximative sur fs_stock. La déaccentuation du terme de recherche (normalizeSearchText)
  // ne s'appliquait jamais à la colonne SQL comparée (st_lib_1_conso reste accentué en base),
  // ce qui faisait échouer silencieusement toute correspondance sur les libellés accentués
  // (ex: "POSÉIDON") sans doublon historique non-accentué compatible.
  const model = extractModelFromIdentif(identif);
  if (!model) return [];

  const format = extractDimensionFormat(identif);
  const allModels = [RefDeco, RefEcom, RefBrico, RefCasto];
  const orderedModels = preferredRefModel
    ? [preferredRefModel, ...allModels.filter((m) => m !== preferredRefModel)]
    : allModels;
  const mongoQuery = format ? { model, format } : { model };
  const mongoDoc = await findRefByModelFormat(orderedModels, mongoQuery, printFinish);
  if (!mongoDoc) return [];

  return [
    {
      reference: mongoDoc.ref,
      modele: mongoDoc.ref,
      libelle: identif,
      gencod: undefined,
      codeTarif: undefined,
      famille: undefined,
      sousFamille: undefined,
      type: undefined,
      source: "mongo_model_format",
    },
  ];
}

function getStockReferenceCategory(reference) {
  const searchableText = normalizeSearchText([
    reference?.reference,
    reference?.modele,
    reference?.libelle,
    reference?.codeTarif,
    reference?.famille,
    reference?.sousFamille,
    reference?.type,
    reference?.st_code_tarif,
    reference?.st_lib_1_conso,
  ].filter(Boolean).join(" "));

  if (isKitPoseLabel(searchableText)) return "kit_pose";
  if (isProfileLabel(searchableText)) return "profil";

  return "visuel";
}

function splitVisualAndProfileReferences(references) {
  const profiles = [];
  const visuals = [];
  const kitPoses = [];

  for (const reference of references || []) {
    const category = getStockReferenceCategory(reference);
    const categorizedReference = { ...reference, category };

    if (category === "profil") profiles.push(categorizedReference);
    else if (category === "kit_pose") kitPoses.push(categorizedReference);
    else visuals.push(categorizedReference);
  }

  return { visuals, profiles, kitPoses };
}

function buildKitPoseReferences(enteteDevis, stockKitPoseReferences) {
  return uniqueBy(
    (enteteDevis || [])
      .map((entete) => {


        const numericStockReference = stockKitPoseReferences?.find((reference) => isNumericReference(reference.reference));
        const stockReference = numericStockReference || stockKitPoseReferences?.[0];
        const reference = stockReference?.reference || numericStockReference?.reference || entete.endv_identif;

        if(! isKitPoseLabel(entete.endv_identif)) return null;

        return {
          reference,
          libelle: entete.endv_identif || stockReference?.libelle,
          articleReference: stockReference?.reference,
          modele: stockReference?.modele,
          gencod: stockReference?.gencod,
          codeTarif: stockReference?.codeTarif,
          famille: stockReference?.famille,
          sousFamille: stockReference?.sousFamille,
          type: stockReference?.type,
          source: stockReference ? "fs_stock" : "fd_entete_devi",
          category: "kit_pose",
        };
      })
      .filter(Boolean),
    (reference) => reference.reference
  );
}

// Le libellé Gamesys (endv_identif) ne mentionne jamais la finition (Mat/Brillant) — elle ne vit que
// côté stock (st_lib_2_conso) et côté dossier (dos_imp_1_fac_p_1, ex: "pelli. Ro (Vernis Brillant) sur VERNI/").
// Sans ce filtre, deux SKUs "identiques" ne différant que par la finition font tous les deux match par
// mots-clés (getSearchTerms exclut "MAT" comme mot vide), et l'ordre st_seq desc tranche arbitrairement —
// biaisant systématiquement la résolution vers la finition Mat.
function detectPrintFinish(dossier) {
  const text = normalizeSearchText(dossier?.dos_imp_1_fac_p_1 || "");
  if (text.includes("BRILLANT")) return "BRILLANT";
  if (text.includes("MAT")) return "MAT";
  return null;
}

function filterStockByFinish(stockRefs, finish) {
  if (!finish || !stockRefs?.length) return stockRefs;
  const mentionsFinish = (s) => normalizeSearchText(`${s.libelle || ""} ${s.modele || ""}`);
  const matching = stockRefs.filter((s) => mentionsFinish(s).includes(finish));
  if (matching.length > 0) return matching;
  const neutral = stockRefs.filter((s) => {
    const text = mentionsFinish(s);
    return !text.includes("MAT") && !text.includes("BRILLANT");
  });
  return neutral.length > 0 ? neutral : stockRefs;
}

function buildVisualReferences(enteteDevis, stockVisualReferences, printFinish) {
  return uniqueBy(
    (enteteDevis || [])
      .map((entete) => {
        if (isProfileLabel(entete.endv_identif)) return null;
        if (isKitPoseLabel(entete.endv_identif)) return null;

        const explicitReference = getVisualReferenceFromEntete(entete);
        const explicitRefNorm = String(explicitReference || "").toUpperCase();
        const finishCandidates = filterStockByFinish(stockVisualReferences, printFinish);

        // Priorité sémantique : le matching par mots-clés passe avant l'exact match sur la ref explicite.
        // La ref explicite (endv_ref_client) peut pointer sur une ancienne version du même article ;
        // la recherche textuelle (ordonnée par st_seq desc) remonte l'article courant en premier.
        const stockReference =
          finishCandidates?.find((stock) => {
            const stockKeyTerms = getSearchTerms(stock.libelle || stock.modele || "");
            const enteteText = normalizeSearchText(entete.endv_identif);
            return stockKeyTerms.length >= 1 && stockKeyTerms.every((term) => enteteText.includes(term));
          }) ||
          (explicitRefNorm
            ? finishCandidates?.find(
                (stock) =>
                  String(stock.reference || "").toUpperCase() === explicitRefNorm ||
                  String(stock.modele || "").toUpperCase() === explicitRefNorm
              )
            : undefined) ||
          finishCandidates?.[0];
        const stockRef = stockReference?.reference;
        // Si st_art_ref_client = gencod (EAN barcode), ignorer — pas une référence visuelle utilisable
        const refIsGencod = stockRef && stockRef === stockReference?.gencod;
        const reference = (refIsGencod ? null : stockRef) || stockReference?.modele || explicitReference || entete.endv_identif;
        if (!reference) return null;

        const smSfamille = String(stockReference?.sousFamille || "").toUpperCase() === "SMES";
        const isSM = smSfamille || (!stockReference && isSurMesureLabel(entete.endv_identif));
        let surMesureFields = {};
        if (isSM) {
          const gab = parseSurMesureGabarit(entete.endv_identif, stockReference?.codeTarif);
          const rc = parseSurMesureRefClient(entete.endv_ref_client);
          surMesureFields = {
            surMesure: true,
            surMesureKind: classifySurMesure(rc),
            deco: rc.name || undefined,
            finition: gab.finition || undefined,
            format: gab.format || undefined,
            orientation: rc.orientation || undefined,
            printFormat: rc.printFormat || undefined,
          };
        }

        return {
          reference,
          libelle: entete.endv_identif || stockReference?.libelle || reference,
          endv_px_total: entete.endv_px_total,
          endv_quant: entete.endv_quant,
          articleReference: stockReference?.reference,
          modele: stockReference?.modele,
          gencod: stockReference?.gencod,
          codeTarif: stockReference?.codeTarif,
          famille: stockReference?.famille,
          sousFamille: stockReference?.sousFamille,
          type: stockReference?.type,
          source: stockReference ? "fs_stock" : "fd_entete_devi",
          category: "visuel",
          ...surMesureFields,
        };
      })
      .filter(Boolean),
    (reference) => reference.reference || reference.modele || reference.libelle
  );
}

function buildProfileReferences(enteteDevis, stockProfileReferences) {
  return uniqueBy(
    (enteteDevis || [])
      .map((entete) => {
        if (!isProfileLabel(entete.endv_identif)) return null;

        const numericStockReference = stockProfileReferences?.find((reference) => isNumericReference(reference.reference));
        const stockReference = numericStockReference || stockProfileReferences?.[0];

        return {
          reference: numericStockReference?.reference,
          libelle: entete.endv_identif || stockReference?.libelle,
          articleReference: stockReference?.reference,
          modele: stockReference?.modele,
          gencod: stockReference?.gencod,
          codeTarif: stockReference?.codeTarif,
          famille: stockReference?.famille,
          sousFamille: stockReference?.sousFamille,
          type: stockReference?.type,
          source: stockReference ? "fs_stock" : "fd_entete_devi",
          category: "profil",
        };
      })
      .filter(Boolean),
    (reference) => reference.reference || reference.libelle
  );
}

function selectDetailView(detail, view) {
  if (view === "full" || view === "raw") return detail;

  const mergedDossier = { ...(detail.dossier || {}), ...(detail.dossierExt || {}) };

  if (view === "visuel") {
    return {
      dossier: pickFields(mergedDossier, ["dos_seq", "dos_codeuniq", "dos_no_cmde", "dos_client"]),
      enteteDevis: detail.enteteDevis.map((entete) =>
        pickFields(entete, ["endv_ndevis", "endv_coduniq", "endv_identif", "endv_no_commande", "endv_no_dossier"])
      ),
      visualReferences: detail.visualReferences,
      profileReferences: detail.profileReferences,
      kitPosesReferences: detail.kitPosesReferences,
    };
  }

  if (view === "production") {
    return {
      dossier: pickFields(mergedDossier, ["dos_seq", "dos_codeuniq", "dos_no_cmde", "dos_client", "dos_date"]),
      enteteDevis: detail.enteteDevis.map((entete) =>
        pickFields(entete, ["endv_identif", "endv_quant", "endv_resp_produ", "endv_qui_lance_en_fab", "endv_statut_dossier", "endv_statut_de_suivi"])
      ),
      elements2: detail.elements2,
      signatures: detail.signatures,
      impositions: detail.impositions,
      agendaProduction: detail.agendaProduction,
      etatsDossier: detail.etatsDossier,
      suiviOperations: detail.suiviOperations,
      pages: detail.pages,
    };
  }

  if (view === "livraison") {
    return {
      dossier: pickFields(mergedDossier, ["dos_seq", "dos_codeuniq", "dos_no_cmde", "dos_client"]),
      enteteDevis: detail.enteteDevis.map((entete) =>
        pickFields(entete, ["endv_identif", "endv_quant", "endv_date_livraison", "endv_no_commande_client"])
      ),
      livraisons: detail.livraisons,
    };
  }

  return {
    dossier: pickFields(mergedDossier, [
      "dos_seq",
      "dos_codeuniq",
      "dos_no_cmde",
      "dos_client",
      "dos_date",
      "dos_supp_1_lib_1",
      "dos_supp_1_lib_2",
      "dos_imp_1_ele",
      "dos_fini_doc_1",
      "dos_forme_et_format",
      "dos_supp_1_ft_imp",
      "dos_supp_1_q_feuil",
      "dos_quantite",
    ]),
    enteteDevis: detail.enteteDevis.map((entete) =>
      pickFields(entete, [
        "endv_ndevis",
        "endv_coduniq",
        "endv_identif",
        "endv_quant",
        "endv_px_total",
        "endv_no_commande",
        "endv_no_commande_client",
        "endv_date_cmde",
        "endv_statut_dossier",
        "endv_statut_de_suivi",
      ])
    ),
    visualReferences: detail.visualReferences,
    profileReferences: detail.profileReferences,
    kitPosesReferences: detail.kitPosesReferences,
    livraison: detail.livraisons.map((livraison) =>
      pickFields(livraison, [
        "bo_no",
        "bo_devis",
        "bo_quant_livree_total",
        "bo_adlivr_nom_1",
        "bo_ville",
        "bo_code_postal",
        "bo_date_souhaitee",
        "bo_date_depart_usine",
        "bo_ref_de_livraison",
      ])
    ),
    production: {
      agenda: detail.agendaProduction.map((agenda) =>
        pickFields(agenda, ["ag_type_date", "ag_date_a_faire", "ag_qui_doit_faire", "ag_libelle"])
      ),
      suivi: detail.suiviOperations.map((suivi) =>
        pickFields(suivi, ["suivi_centre", "suivi_tps_prevu", "suivi_ct_prevu", "suivi_dept", "suivi_lien_solution"])
      ),
    },
  };
}

function getDossierRootNumber(detail) {
  const commande = detail?.dossier?.dos_no_cmde;
  if (commande) return String(commande).split("/")[0];

  const entete = detail?.enteteDevis?.[0];
  if (entete?.endv_no_dossier) return String(entete.endv_no_dossier);
  if (entete?.endv_no_cmde_globale) return String(entete.endv_no_cmde_globale);

  return detail?.dossier?.dos_seq ? String(detail.dossier.dos_seq) : "";
}

function getSubDossierNumber(detail) {
  const commande = detail?.dossier?.dos_no_cmde || detail?.enteteDevis?.[0]?.endv_no_commande || "";
  const parts = String(commande).split("/");
  return parts[1] || "00";
}

function flattenVisualReferences(details) {
  return uniqueBy(
    details.flatMap((detail) => detail.visualReferences || []),
    (reference) => reference.reference || reference.modele || reference.libelle
  );
}

function flattenProfileReferences(details) {
  return uniqueBy(
    details.flatMap((detail) => detail.profileReferences || []),
    (reference) => reference.reference || reference.modele || reference.libelle
  );
}

function flattenKitPoseReferences(details) {
  return uniqueBy(
    details.flatMap((detail) => detail.kitPosesReferences || []),
    (reference) => reference.reference || reference.modele || reference.libelle
  );
}

function buildGroupedResponse(details, view) {
  if (view === "raw") return details;

  const sortedDetails = [...details].sort((a, b) =>
    getSubDossierNumber(b).localeCompare(getSubDossierNumber(a), "fr", { numeric: true })
  );
  const first = sortedDetails[0] || {};
  const rootNumber = getDossierRootNumber(first);
  const visualReferences = flattenVisualReferences(sortedDetails);
  const profileReferences = flattenProfileReferences(sortedDetails);
  const kitPosesReferences = flattenKitPoseReferences(sortedDetails);
  let clientName;
  if (first.dossier?.dos_client || first.enteteDevis?.[0]?.endv_cclient) {
    const client = first.dossier?.dos_client || first.enteteDevis?.[0]?.endv_cclient;
    const client_name = ['LM', 'BM', 'CAS', 'ECOM'];
    for (const name of client_name) {
      if (String(client).startsWith(name)) {
        clientName = name;
        break;
      }
    }
    // Compte sans préfixe enseigne (PRO###, EPROCB, I96, ...) : déduire ECOM depuis la famille
    // catalogue des références déjà résolues (aucune requête supplémentaire — stock déjà résolu).
    if (!clientName && CATALOGUE_RECOVERY) {
      clientName =
        deduceAppClientFromCatalogue(
          client,
          [...visualReferences, ...profileReferences, ...kitPosesReferences].map((r) => ({
            label: r.libelle,
            famille: r.famille,
            tarif: r.codeTarif,
          }))
        ) || undefined;
    }
  }

  const grouped = {
    numero: rootNumber,
    client: first.dossier?.dos_client || first.enteteDevis?.[0]?.endv_cclient,
    clientName: clientName,
    nbSousDossiers: sortedDetails.length,
    visualReferences,
    profileReferences,
    kitPosesReferences,
    sousDossiers: sortedDetails.map((detail) => ({
      sousNumero: getSubDossierNumber(detail),
      commande: detail.dossier?.dos_no_cmde || detail.enteteDevis?.[0]?.endv_no_commande,
      ...detail,
      visualReferences: detail.visualReferences || [],
      profileReferences: detail.profileReferences || [],
      kitPosesReferences: detail.kitPosesReferences || [],
    })),
  };

  if (view === "summary") {
    grouped.resume = {
      nbLivraisons: sortedDetails.reduce((total, detail) => total + (detail.livraison?.length || 0), 0),
      nbEtapesProduction: sortedDetails.reduce((total, detail) => total + (detail.production?.agenda?.length || 0), 0),
      nbOperationsSuivi: sortedDetails.reduce((total, detail) => total + (detail.production?.suivi?.length || 0), 0),
    };
  }

  if (view === "production") {
    grouped.resume = {
      nbEtapesAgenda: sortedDetails.reduce((total, detail) => total + (detail.agendaProduction?.length || 0), 0),
      nbOperationsSuivi: sortedDetails.reduce((total, detail) => total + (detail.suiviOperations?.length || 0), 0),
      nbEtats: sortedDetails.reduce((total, detail) => total + (detail.etatsDossier?.length || 0), 0),
    };
  }

  if (view === "livraison") {
    grouped.resume = {
      nbLivraisons: sortedDetails.reduce((total, detail) => total + (detail.livraisons?.length || 0), 0),
    };
  }

  if (view === "full") {
    grouped.resume = {
      nbBlocsLies: sortedDetails.reduce(
        (total, detail) =>
          total +
          countRows(detail, [
            "enteteDevis",
            "elements2",
            "elements2Ext",
            "docOperations",
            "listeMarges",
            "descriptifs",
            "livraisons",
            "signatures",
            "impositions",
            "agendaProduction",
            "etatsDossier",
            "suiviOperations",
            "pages",
          ]),
        0
      ),
    };
  }

  return grouped;
}

// endv_seq = dos_seq : lien direct fiable entre un dossier et son entête (celui utilisé par
// listCommandesAvecProfilsKits pour détecter les candidats profils/kits). Les critères textuels
// (endv_no_dossier/endv_no_commande/...) peuvent diverger de dos_no_cmde quand Gamesys renumérote
// un dossier après coup — sans ce fallback par seq, l'entête d'origine (et ses profils/kits) devient
// introuvable ici alors qu'elle avait bien été repérée à la détection, et la commande est ignorée
// silencieusement (aucune erreur, aucun article sauvegardé).
async function fetchEnteteDevis(connection, commande, code, seq) {
  try {
    const rows = await query(
      connection,
      `select * from public.fd_entete_devi where endv_no_dossier = ? or endv_no_commande = ? or endv_no_cmde_globale = ? or endv_no_dossier_site_donneur = ? or endv_coduniq = ? or endv_seq = ?`,
      [commande, commande, commande, commande, code, seq]
    );
    return uniqueBy(rows, (row) => row.endv_seq);
  } catch (error) {
    logger.warn(`Erreur entête devis: ${error.message}`);
    return [];
  }
}

// Résout, pour une commande racine, les sous-dossiers qui portent un visuel (panneau déco) précis
// et leur ref Gamesys — version allégée de getDossierDetail/buildDetail : une seule connexion
// injectée réutilisée pour toute la commande (pas de connexion neuve par sous-dossier), et aucune
// des requêtes production/livraison/suivi non nécessaires ici. Destinée à un run en boucle
// (syncDecoStubsDepuisGamesys), pas à un affichage ponctuel — cf. feedback_odbc_backfill_resource_limits.
async function fetchSousDossiersVisuels(connection, numero) {
  const search = String(numero);
  const searchLike = `${escapeSqlLike(search)}/%`;
  const codeUniqLike = `${escapeSqlLike(search)}v%`;
  const formattedSeq = search.replace(/\/00$/, "v0").replace(/\//g, "v");

  const dossiers = await query(
    connection,
    `select d.* from public.fd_dossier d where (d.dos_seq = ? or d.dos_no_cmde = ? or d.dos_no_cmde LIKE ? ESCAPE '\\' or d.dos_codeuniq = ? or d.dos_codeuniq LIKE ? ESCAPE '\\') order by d.dos_seq desc`,
    [Number(search) || 0, search, searchLike, formattedSeq, codeUniqLike]
  );

  const resultats = [];
  for (const dossier of dossiers) {
    const commande = dossier.dos_no_cmde || "";
    const enteteDevis = await fetchEnteteDevis(connection, commande, dossier.dos_codeuniq, dossier.dos_seq);
    if (enteteDevis.length === 0) continue;

    const preferredRefModel = getPreferredRefModel(dossier.dos_client);
    const printFinish = detectPrintFinish(dossier);

    let visualReferences = [];
    try {
      const stockRefSets = await Promise.all(
        enteteDevis.map((entete) =>
          findStockReferences(connection, [entete], preferredRefModel, printFinish).catch(() => [])
        )
      );
      const stockReferences = uniqueBy(stockRefSets.flat(), (r) => r.reference || r.modele);
      const { visuals } = splitVisualAndProfileReferences(stockReferences);
      visualReferences = buildVisualReferences(enteteDevis, visuals, printFinish);
    } catch (error) {
      logger.warn(`fetchSousDossiersVisuels: résolution stock échouée pour ${commande}: ${error.message}`);
    }

    if (visualReferences.length === 0) continue;

    resultats.push({
      sousNumero: getSubDossierNumber({ dossier, enteteDevis }),
      commande,
      visualReferences,
      // Repli quand la référence Gamesys ne valide pas contre notre catalogue interne (ref/format/
      // finition/deco laissés vides, cf. decoGamesysStubSyncService) : dos_forme_et_format ("Ft. fini
      // : 1000 x 2100 mm") donne le format fini réel du visuel (converti en cm par extractDimensionFormat,
      // même fonction que la résolution model+format), et printFinish (déjà calculé ci-dessus depuis
      // dos_imp_1_fac_p_1 pour désambiguïser le matching) donne Mat/Brillant sans dépendre du catalogue.
      formatFini: extractDimensionFormat(dossier.dos_forme_et_format),
      printFinish,
    });
  }

  return resultats;
}

async function fetchOptionalRows(connection, sql, params = []) {
  try {
    return await query(connection, sql, params);
  } catch (error) {
    logger.warn(`Erreur requête liée: ${error.message}`);
    return [];
  }
}

async function buildDetail(connection, dossier) {
  const dossierCommande = dossier?.dos_no_cmde || "";
  const dossierCode = dossier?.dos_codeuniq || "";
  const dosSeq = dossier.dos_seq;
  // textValues : utilisé pour les clauses IN multi-valeurs — échappement manuel maintenu
  // car ODBC ne supporte pas les placeholders IN dynamiques sans reconstruction de la requête
  const textValues = sqlTextList([dossierCommande, dossierCode]);

  // Batch principal (connection) + batch lié (conn2) en parallèle
  const primaryBatch = async () => {
    const enteteDevis = await fetchEnteteDevis(connection, dossierCommande, dossierCode, dosSeq);
    const dossierExtRows = dossierCommande
      ? await fetchOptionalRows(connection, `select * from public.fd_dossier_ext where dos_seq = ? or dos_no_cmde = ?`, [dosSeq, dossierCommande])
      : await fetchOptionalRows(connection, `select * from public.fd_dossier_ext where dos_seq = ?`, [dosSeq]);
    const elements = await fetchOptionalRows(
      connection,
      `select eldv_seq, eldv_codeuniq, eldv_libelle, eldv_libelle_papier, eldv_client_no, eldv_num_no_1, eldv_num_no_2 from public.fd_elem_devis where eldv_seq = ? order by eldv_codeuniq`,
      [dosSeq]
    );
    const elements2 = await fetchOptionalRows(connection, `select * from public.fd_elem_devis_2 where eldv_no_devis = ?`, [dossierCode]);
    const elements2Ext = await fetchOptionalRows(connection, `select * from public.fd_elem_devis_2_ext where eldv_no_devis = ?`, [dossierCode]);
    const document = await fetchOptionalRows(
      connection,
      `select dodv_seq, dodv_num_no_1, dodv_num_no_2, dodv_lib_version_1, dodv_lib_version_2, dodv_lib_version_3, dodv_cout_dossier from public.fd_docum_devi where dodv_seq = ?`,
      [dosSeq]
    );
    const versions = dossierCommande
      ? await fetchOptionalRows(connection, `select dove_seq, dove_codeuniq, dove_no_cmde, dove_quant_v_1, dove_lib_v_1, dove_quant_v_2, dove_lib_v_2, dove_quant_v_3, dove_lib_v_3 from public.fd_dossier_version where dove_seq = ? or dove_no_cmde = ?`, [dosSeq, dossierCommande])
      : await fetchOptionalRows(connection, `select dove_seq, dove_codeuniq, dove_no_cmde, dove_quant_v_1, dove_lib_v_1, dove_quant_v_2, dove_lib_v_2, dove_quant_v_3, dove_lib_v_3 from public.fd_dossier_version where dove_seq = ?`, [dosSeq]);
    const remarques = dossierCommande
      ? await fetchOptionalRows(connection, `select * from public.fd_dossier_remarques where dos_rem_seq = ? or dos_rem_no_cmde = ?`, [dosSeq, dossierCommande])
      : await fetchOptionalRows(connection, `select * from public.fd_dossier_remarques where dos_rem_seq = ?`, [dosSeq]);
    return { enteteDevis, dossierExtRows, elements, elements2, elements2Ext, document, versions, remarques };
  };

  const relatedBatch = async () => {
    if (!textValues) return new Array(11).fill([]);
    // IN clauses : échappement manuel maintenu (ODBC ne supporte pas les placeholders IN dynamiques)
    const docOperations = await fetchOptionalRows(connection, `select * from public.fd_elem_doc_ope where dev_code_devis in (${textValues})`);
    const fichierForme = await fetchOptionalRows(connection, `select * from public.fd_fichier_forme where placoul_devis in (${textValues})`);
    const listeMarges = await fetchOptionalRows(connection, `select * from public.fd_liste_marges where mgdev_seq = ?`, [dosSeq]);
    const descriptifs = await fetchOptionalRows(connection, `select * from public.fdescriptif where devis in (${textValues})`);
    const livraisons = await fetchOptionalRows(connection, `select * from public.ff_livraison where bo_no_dossier = ? or bo_devis = ?`, [dossierCommande, dossierCode]);
    const signatures = await fetchOptionalRows(connection, `select * from public.fi_sol_signature where sign_dossier = ? or sign_devis = ?`, [dossierCommande, dossierCode]);
    const impositions = await fetchOptionalRows(connection, `select * from public.fi_sol_imposition where impo_code_devis = ?`, [dossierCode]);
    const agendaProduction = await fetchOptionalRows(connection, `select * from public.fp_agenda_prod where ag_dossier = ?`, [dossierCommande]);
    const etatsDossier = await fetchOptionalRows(connection, `select * from public.fp_lien_etat_dossier where fled_num_dossier = ?`, [dossierCommande]);
    const likeCommande = `${escapeSqlLike(dossierCommande)}%`;
    const suiviOperations = await fetchOptionalRows(connection, `select * from public.fp_opera_suivi where suivi_dossier = ? or suivi_dossier_element like ? ESCAPE '\\'`, [dossierCommande, likeCommande]);
    const pages = await fetchOptionalRows(connection, `select * from public.fp_pages where pages_dossier = ?`, [dossierCommande]);
    return [docOperations, fichierForme, listeMarges, descriptifs, livraisons, signatures, impositions, agendaProduction, etatsDossier, suiviOperations, pages];
  };

  const primary = await primaryBatch();
  const relatedResults = await relatedBatch();
  const [docOperations, fichierForme, listeMarges, descriptifs, livraisons, signatures, impositions, agendaProduction, etatsDossier, suiviOperations, pages] = relatedResults;

  let visualReferences = [];
  let profileReferences = [];
  let kitPosesReferences = [];

  try {
    const preferredRefModel = getPreferredRefModel(dossier.dos_client);
    const printFinish = detectPrintFinish(dossier);
    const stockRefSets = await Promise.all(
      primary.enteteDevis.map((entete) =>
        findStockReferences(connection, [entete], preferredRefModel, printFinish).catch(() => [])
      )
    );
    const stockReferences = uniqueBy(stockRefSets.flat(), (r) => r.reference || r.modele);
    const categorizedAll = splitVisualAndProfileReferences(stockReferences);
    visualReferences = buildVisualReferences(primary.enteteDevis, categorizedAll.visuals, printFinish);
    // Profils/kits : résolution par entête pour éviter qu'une ref d'une autre ligne
    // soit retournée (buildProfileReferences prend le 1er numérique du pool, donc
    // toutes les lignes reçoivent la même ref si le pool est fusionné).
    profileReferences = uniqueBy(
      primary.enteteDevis.flatMap((entete, i) => {
        const { profiles } = splitVisualAndProfileReferences(stockRefSets[i] || []);
        return buildProfileReferences([entete], profiles);
      }),
      (r) => r.reference || r.libelle
    );
    kitPosesReferences = uniqueBy(
      primary.enteteDevis.flatMap((entete, i) => {
        const { kitPoses } = splitVisualAndProfileReferences(stockRefSets[i] || []);
        return buildKitPoseReferences([entete], kitPoses);
      }),
      (r) => r.reference || r.libelle
    );
  } catch (error) {
    logger.warn(`Erreur références stock pour seq ${dossier.dos_seq}: ${error.message}`);
  }

  return {
    dossier,
    enteteDevis: primary.enteteDevis,
    visualReferences,
    profileReferences,
    kitPosesReferences,
    dossierExt: primary.dossierExtRows[0] || null,
    elements: primary.elements,
    elements2: primary.elements2,
    elements2Ext: primary.elements2Ext,
    document: primary.document[0] || null,
    versions: primary.versions,
    remarques: primary.remarques,
    docOperations,
    fichierForme,
    listeMarges,
    descriptifs,
    livraisons,
    signatures,
    impositions,
    agendaProduction,
    etatsDossier,
    suiviOperations,
    pages,
  };
}

async function listDossiers({ limit = 20, client, commande } = {}) {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const where = [];
  const params = [];

  if (client) {
    where.push("d.dos_client = ?");
    params.push(client);
  }

  if (commande) {
    where.push("d.dos_no_cmde = ?");
    params.push(commande);
  }

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";

  const connection = await getDbConnection();
  try {
    return await query(
      connection,
      `
      select
        d.dos_seq,
        d.dos_codeuniq,
        d.dos_no_cmde,
        d.dos_client,
        d.dos_date,
        d.dos_date_maj,
        d.dos_date_livraison_originelle,
        e.endv_ndevis,
        e.endv_nvariant,
        e.endv_identif,
        e.endv_quant,
        e.endv_px_total,
        e.endv_statut_dossier,
        e.endv_statut_de_suivi,
        e.endv_ref_client
      from public.fd_dossier d
      left join public.fd_entete_devi e on e.endv_seq = d.dos_seq
      ${whereSql}
      order by d.dos_date desc nulls last, d.dos_seq desc
      limit ${safeLimit}
    `,
      params
    );
  } finally {
    await closeConnection(connection);
  }
}

// Pure — pas d'accès ODBC — regroupe les lignes fd_dossier/fd_entete_devi en candidats
// { cmd, client } uniques, en ne gardant que les lignes profil/kit de pose.
function groupCandidatesFromRows(rows) {
  const candidates = new Map();
  for (const row of rows || []) {
    if (!row.dos_no_cmde) continue;
    if (!isProfileLabel(row.endv_identif) && !isKitPoseLabel(row.endv_identif)) continue;

    const cmd = String(row.dos_no_cmde).split("/")[0];
    const appClient = mapDosClientToAppClient(row.dos_client);
    if (!appClient) continue;

    const key = `${cmd}|${appClient}`;
    if (!candidates.has(key)) candidates.set(key, { cmd, client: appClient });
  }

  return [...candidates.values()];
}

// Même regroupement que groupCandidatesFromRows, mais sans le filtre profil/kit — utilisé pour
// syncDecoStubsDepuisGamesys, qui doit créer un stub pour TOUT dossier récent (pas seulement ceux
// contenant un profil ou un kit de pose).
function groupAllCandidatesFromRows(rows) {
  const candidates = new Map();
  for (const row of rows || []) {
    if (!row.dos_no_cmde) continue;

    const cmd = String(row.dos_no_cmde).split("/")[0];
    const appClient = mapDosClientToAppClient(row.dos_client);
    if (!appClient) continue;

    const key = `${cmd}|${appClient}`;
    if (!candidates.has(key)) candidates.set(key, { cmd, client: appClient });
  }

  return [...candidates.values()];
}

async function listCommandesAvecProfilsKits({ sinceDate, client } = {}) {
  if (!sinceDate) {
    const error = new Error("sinceDate est requis.");
    error.code = "SINCE_DATE_REQUIRED";
    error.status = 400;
    throw error;
  }

  // node-odbc ne sait pas binder un objet Date JS — on passe une date texte (YYYY-MM-DD),
  // comparable nativement à une colonne PostgreSQL `date`.
  const sinceDateText = sinceDate instanceof Date ? sinceDate.toISOString().slice(0, 10) : String(sinceDate);

  // Scan direct de fd_entete_devi (via endv_date_cmde, renseigné sur 100% des lignes) plutôt
  // qu'une jointure fd_dossier/fd_entete_devi sur endv_seq = dos_seq : cette jointure stricte
  // s'est révélée peu fiable en pratique (dos_seq et endv_seq ne sont pas systématiquement
  // alignés 1:1) et faisait manquer ~74% des candidats profils/kits réels sur une fenêtre d'un
  // an (2558 manqués sur 3453 vérifiés par scan indépendant). endv_no_commande (avec suffixe
  // /NN) est préféré à endv_no_dossier pour rester cohérent avec le format "cmd/sous-dossier"
  // attendu par groupCandidatesFromRows — le fallback est fait en JS (pas en SQL via
  // coalesce/nullif, qui fait planter le driver ODBC : "Error allocating or reallocating
  // memory when fetching data").
  const connection = await getDbConnection();
  let rawRows;
  let famMap = null;
  try {
    rawRows = await query(
      connection,
      `
      select endv_no_dossier, endv_no_commande, endv_cclient, endv_identif
      from public.fd_entete_devi
      where endv_date_cmde >= ?
    `,
      [sinceDateText]
    );
    // Index libellé -> famille chargé sur la même connexion (une passe) pour la récupération
    // des comptes sans préfixe enseigne.
    if (CATALOGUE_RECOVERY) famMap = await loadFamilleByLabel(connection);
  } finally {
    await closeConnection(connection);
  }

  const rows = rawRows.map((row) => ({
    dos_no_cmde: row.endv_no_commande || row.endv_no_dossier,
    dos_client: row.endv_cclient,
    endv_identif: row.endv_identif,
  }));

  const candidates = groupCandidatesFromRows(rows);
  // 2ᵉ passe additive : rattache à ECOM les commandes des comptes sans préfixe connu (PRO###,
  // EPROCB, I96, ...) dont le contenu est du catalogue déco avec au moins un profilé/kit.
  const recovered = recoverCandidatesFromCatalogue(rows, famMap, { requireProfilKit: true });
  if (recovered.length) {
    logger.info(
      `listCommandesAvecProfilsKits: +${recovered.length} commande(s) récupérée(s) par catalogue`
    );
  }
  const all = mergeCandidates(candidates, recovered);
  // Filtrage sur l'enum applicatif (LM/CASTO/BRICO/ECOM) — dos_client contient des codes bruts
  // Gamesys (ex: "LM01", "CAS02", "BM01") non comparables directement en SQL à cet enum.
  return client ? all.filter((c) => c.client === client) : all;
}

// Même requête que listCommandesAvecProfilsKits, mais renvoie TOUS les dossiers récents (pas
// seulement ceux avec profil/kit) — utilisé par syncDecoStubsDepuisGamesys pour créer un stub Deco
// dès qu'un nouveau dossier apparaît dans Gamesys.
async function listCommandesRecentes({ sinceDate, client } = {}) {
  if (!sinceDate) {
    const error = new Error("sinceDate est requis.");
    error.code = "SINCE_DATE_REQUIRED";
    error.status = 400;
    throw error;
  }

  const sinceDateText = sinceDate instanceof Date ? sinceDate.toISOString().slice(0, 10) : String(sinceDate);

  const connection = await getDbConnection();
  let rawRows;
  let famMap = null;
  try {
    rawRows = await query(
      connection,
      `
      select endv_no_dossier, endv_no_commande, endv_cclient, endv_identif
      from public.fd_entete_devi
      where endv_date_cmde >= ?
    `,
      [sinceDateText]
    );
    if (CATALOGUE_RECOVERY) famMap = await loadFamilleByLabel(connection);
  } finally {
    await closeConnection(connection);
  }

  const rows = rawRows.map((row) => ({
    dos_no_cmde: row.endv_no_commande || row.endv_no_dossier,
    dos_client: row.endv_cclient,
    endv_identif: row.endv_identif,
  }));

  const candidates = groupAllCandidatesFromRows(rows);
  // Récupération catalogue sans filtre profil/kit : un stub est créé pour tout dossier récent
  // (y compris visuels seuls).
  const recovered = recoverCandidatesFromCatalogue(rows, famMap, { requireProfilKit: false });
  if (recovered.length) {
    logger.info(
      `listCommandesRecentes: +${recovered.length} commande(s) récupérée(s) par catalogue`
    );
  }
  const all = mergeCandidates(candidates, recovered);
  return client ? all.filter((c) => c.client === client) : all;
}

async function searchDossiers({ q = "", limit = 10 } = {}) {
  const search = String(q || "").trim();
  if (search.length < 2) return [];

  const safeLimit = Math.min(Math.max(limit, 1), 20);
  const likeQ = `${escapeSqlLike(search)}%`;
  const connection = await getDbConnection();

  try {
    const rows = await query(
      connection,
      `
      select
        split_part(d.dos_no_cmde, '/', 1) as numero,
        min(d.dos_client) as client,
        count(distinct d.dos_no_cmde) as nb_sous_dossiers,
        max(l.bo_adlivr_nom_1) as magasin,
        max(l.bo_ville) as ville
      from public.fd_dossier d
      left join public.ff_livraison l on l.bo_no_dossier = d.dos_no_cmde
      where d.dos_no_cmde is not null
        and d.dos_no_cmde <> ''
        and (
          d.dos_no_cmde like ? ESCAPE '\\'
          or split_part(d.dos_no_cmde, '/', 1) like ? ESCAPE '\\'
        )
      group by split_part(d.dos_no_cmde, '/', 1)
      order by numero desc
      limit ${safeLimit}
    `,
      [likeQ, likeQ]
    );

    return rows.map((row) => {
      const magasin = row.magasin || "";
      const ville = row.ville || "";
      const suffix = magasin || ville || row.client || "";

      return {
        numero: row.numero,
        client: row.client,
        magasin,
        ville,
        nbSousDossiers: Number(row.nb_sous_dossiers || 0),
        label: suffix ? `${row.numero} - ${suffix}` : row.numero,
      };
    });
  } finally {
    await closeConnection(connection);
  }
}

async function getDossierDetail({ seq, commande, numero, q, view = "summary", raw = false } = {}) {
  const search = seq || commande || numero || q;
  if (!search) {
    const error = new Error("Veuillez fournir un numéro de dossier (ex: ?numero=164629). ");
    error.code = "DOSSIER_QUERY_REQUIRED";
    error.status = 400;
    throw error;
  }

  const formattedSeq = search.replace(/\/00$/, "v0").replace(/\//g, "v");

  let dossiersSql;
  let dossiersParams;
  if (/^\d+$/.test(search)) {
    const searchLike = `${escapeSqlLike(search)}/%`;
    const codeUniqLike = `${escapeSqlLike(search)}v%`;
    dossiersSql = `select d.* from public.fd_dossier d where (d.dos_seq = ? or d.dos_no_cmde = ? or d.dos_no_cmde LIKE ? ESCAPE '\\' or d.dos_codeuniq = ? or d.dos_codeuniq LIKE ? ESCAPE '\\') order by d.dos_seq desc`;
    dossiersParams = [Number(search), search, searchLike, formattedSeq, codeUniqLike];
  } else {
    const searchLike = `%${escapeSqlLike(search)}%`;
    dossiersSql = `select d.* from public.fd_dossier d where (d.dos_no_cmde = ? or d.dos_no_cmde LIKE ? ESCAPE '\\' or d.dos_codeuniq = ?) order by d.dos_seq desc`;
    dossiersParams = [search, searchLike, formattedSeq];
  }

  const connection = await getDbConnection();
  let dossiers;
  try {
    dossiers = await query(connection, dossiersSql, dossiersParams);
  } finally {
    await closeConnection(connection);
  }

  const details = await Promise.all(
    dossiers.map(async (dossier) => {
      const conn = await getDbConnection();
      try {
        const detail = await buildDetail(conn, dossier);
        const selectedDetail = selectDetailView(detail, view);
        return raw ? selectedDetail : cleanDbValue(selectedDetail);
      } finally {
        await closeConnection(conn);
      }
    })
  );

  return buildGroupedResponse(details, view);
}

// Requête minimale (une seule colonne) pour retrouver la date Gamesys d'une commande racine
// (ex: "100473" → matche "100473/00", "100473/01", ...) sans payer le coût de getDossierDetail
// (entêtes, stock, livraisons, etc.) — utilisé pour peupler ConsommationCommande.dateCommande
// en masse lors d'un backfill. Connexion injectée (comme fetchEnteteDevis) pour permettre au
// backfill de réutiliser une seule connexion sur toute la boucle, et pour la testabilité.
async function fetchDossierDate(connection, commande) {
  const search = String(commande || "");
  if (!search) return null;

  const searchLike = `${escapeSqlLike(search)}/%`;
  const rows = await query(
    connection,
    `select min(dos_date) as dos_date from public.fd_dossier where dos_no_cmde = ? or dos_no_cmde LIKE ? ESCAPE '\\'`,
    [search, searchLike]
  );
  const value = rows?.[0]?.dos_date;
  return value ? new Date(value) : null;
}

async function getDossierDate(commande) {
  const connection = await getDbConnection();
  try {
    return await fetchDossierDate(connection, commande);
  } finally {
    await closeConnection(connection);
  }
}

// Requête minimale équivalente à fetchDossierDate, mais pour les dates de livraison
// (ff_livraison.bo_date_depart_usine / bo_date_souhaitee) — utilisé pour le backfill de
// ConsommationCommande.dateDepartUsine / dateLivraisonSouhaitee. Jointure identique à celle
// utilisée dans buildDetail pour retrouver les livraisons d'un dossier (bo_no_dossier = dos_no_cmde
// ou bo_devis = dos_codeuniq).
async function fetchDossierLivraisonDates(connection, commande) {
  const search = String(commande || "");
  if (!search) return { dateDepartUsine: null, dateLivraisonSouhaitee: null, magasin: null, ville: null };

  const searchLike = `${escapeSqlLike(search)}/%`;
  const rows = await query(
    connection,
    `select min(l.bo_date_depart_usine) as bo_date_depart_usine, min(l.bo_date_souhaitee) as bo_date_souhaitee,
            max(l.bo_adlivr_nom_1) as bo_adlivr_nom_1, max(l.bo_ville) as bo_ville
     from public.fd_dossier d
     join public.ff_livraison l on (l.bo_no_dossier = d.dos_no_cmde or l.bo_devis = d.dos_codeuniq)
     where d.dos_no_cmde = ? or d.dos_no_cmde LIKE ? ESCAPE '\\'`,
    [search, searchLike]
  );
  const row = rows?.[0] || {};
  return {
    dateDepartUsine: row.bo_date_depart_usine ? new Date(row.bo_date_depart_usine) : null,
    dateLivraisonSouhaitee: row.bo_date_souhaitee ? new Date(row.bo_date_souhaitee) : null,
    // magasin (bo_adlivr_nom_1) = nom du destinataire livraison — le nom du client final pour ECOM
    // (livraison directe), une enseigne/ville de magasin pour LM/CASTO/BRICO. ville (bo_ville) =
    // ville de livraison, utilisée comme repère "magasin" pour les enseignes physiques.
    magasin: row.bo_adlivr_nom_1 || null,
    ville: row.bo_ville || null,
  };
}

// Wrapper avec connexion dédiée pour fetchDossierLivraisonDates, sur le modèle de getDossierDate
// — utilisé pour peupler Deco.dateLivraisonSouhaitee à la volée (une commande à la fois, pas de
// connexion à réutiliser sur une boucle contrairement au backfill).
async function getDossierLivraisonDates(commande) {
  const connection = await getDbConnection();
  try {
    return await fetchDossierLivraisonDates(connection, commande);
  } finally {
    await closeConnection(connection);
  }
}

// Requête minimale (une seule colonne agrégée) pour retrouver le prix total Gamesys d'une commande
// racine (ex: "100473" → somme sur "100473/00", "100473/01", ...) — utilisé pour peupler
// Deco.prixTotal. Requête directement sur fd_entete_devi (pas de jointure fd_dossier) : vérifié
// empiriquement que endv_seq = dos_seq n'est PAS un lien fiable (les deux séquences dérivent
// indépendamment — ex. dossier 167435 : dos_seq 60765-60769 vs endv_seq 23145-23149, aucune égalité),
// contrairement à ce que suggérait le commentaire au-dessus de fetchEnteteDevis. endv_no_dossier et
// endv_no_cmde_globale portent directement le numéro de dossier racine sur chaque ligne
// fd_entete_devi ; endv_no_commande (exact ou LIKE 'racine/%') est gardé en repli pour les lignes où
// endv_no_dossier/endv_no_cmde_globale seraient absents.
// Connexion injectée (comme fetchDossierDate/fetchDossierLivraisonDates) pour permettre au backfill
// de réutiliser une seule connexion sur toute la boucle, et pour la testabilité.
async function fetchDossierPrixTotal(connection, commande) {
  const search = String(commande || "");
  if (!search) return null;

  const searchLike = `${escapeSqlLike(search)}/%`;
  const rows = await query(
    connection,
    `select sum(e.endv_px_total) as prix_total
     from public.fd_entete_devi e
     where e.endv_no_dossier = ? or e.endv_no_cmde_globale = ?
        or e.endv_no_commande = ? or e.endv_no_commande LIKE ? ESCAPE '\\'`,
    [search, search, search, searchLike]
  );
  const value = rows?.[0]?.prix_total;
  return value != null ? Number(value) : null;
}

// Wrapper avec connexion dédiée pour fetchDossierPrixTotal, sur le modèle de getDossierDate
// — utilisé pour peupler Deco.prixTotal à la volée (une commande à la fois).
async function getDossierPrixTotal(commande) {
  const connection = await getDbConnection();
  try {
    return await fetchDossierPrixTotal(connection, commande);
  } finally {
    await closeConnection(connection);
  }
}

// Récupère en un aller-retour Gamesys date de commande / code client / référence client / cumul
// profils / cumul kits de pose / prix total d'un dossier racine — mêmes lignes et même clause WHERE
// que l'ancien fetchDossierPrixTotal (fusionné ici : les deux étaient systématiquement appelés côte
// à côte sur fd_entete_devi pour la même commande — decoGamesysStubSyncService.js, jobsController.js
// — un aller-retour ODBC économisé à chaque appel). nombreProfil/nombreKitPose catégorisés en JS via
// isProfileLabel/isKitPoseLabel plutôt qu'en SQL (endv_identif est un libellé libre, pas une colonne
// de type) ; prixTotal sommé en JS (au lieu d'un SUM SQL) pour rester sur les mêmes lignes brutes,
// en préservant la sémantique SQL SUM (null si aucune ligne n'a de prix, jamais confondu avec 0).
// dateCommande/codeClient/refClient sont identiques sur toutes les lignes d'un même dossier
// (vérifié empiriquement) — on prend donc la 1ère ligne, comme fetchDossierDate.
async function fetchDossierCommandeInfo(connection, commande) {
  const search = String(commande || "");
  if (!search) return null;

  const searchLike = `${escapeSqlLike(search)}/%`;
  const rows = await query(
    connection,
    `select endv_date_cmde, endv_cclient, endv_no_commande_client, endv_quant, endv_identif, endv_px_total
     from public.fd_entete_devi
     where endv_no_dossier = ? or endv_no_cmde_globale = ?
        or endv_no_commande = ? or endv_no_commande LIKE ? ESCAPE '\\'`,
    [search, search, search, searchLike]
  );
  if (!rows.length) return null;

  let nombreProfil = 0;
  let nombreKitPose = 0;
  let prixTotal = null;
  for (const row of rows) {
    const quant = Number(row.endv_quant) || 0;
    if (isProfileLabel(row.endv_identif)) nombreProfil += quant;
    else if (isKitPoseLabel(row.endv_identif)) nombreKitPose += quant;
    if (row.endv_px_total !== null && row.endv_px_total !== undefined) {
      prixTotal = (prixTotal ?? 0) + Number(row.endv_px_total);
    }
  }

  return {
    dateCommande: rows[0].endv_date_cmde ? new Date(rows[0].endv_date_cmde) : null,
    codeClient: rows[0].endv_cclient || null,
    refClient: rows[0].endv_no_commande_client || null,
    nombreProfil,
    nombreKitPose,
    prixTotal,
  };
}

// Wrapper avec connexion dédiée pour fetchDossierCommandeInfo, sur le modèle de getDossierPrixTotal
// — utilisé pour peupler Deco.dateCommande/codeClient/refClient/nombreProfil/nombreKitPose à la
// volée (une commande à la fois).
async function getDossierCommandeInfo(commande) {
  const connection = await getDbConnection();
  try {
    return await fetchDossierCommandeInfo(connection, commande);
  } finally {
    await closeConnection(connection);
  }
}

// Format de plaque support Gamesys (dos_supp_1_ft, ex: "1510 x 2600") — vide sur les lignes
// profil/kit de pose, identique sur toutes les lignes visuel d'un même dossier (vérifié
// empiriquement) : on prend donc la 1ère ligne non vide. Champ de vérification pour Deco.dibond
// (saisi manuellement par l'utilisateur), sans le remplacer.
async function fetchDossierFormatPlaque(connection, commande) {
  const search = String(commande || "");
  if (!search) return null;

  const searchLike = `${escapeSqlLike(search)}/%`;
  const rows = await query(
    connection,
    `select dos_supp_1_ft
     from public.fd_dossier
     where dos_no_cmde = ? or dos_no_cmde LIKE ? ESCAPE '\\'`,
    [search, searchLike]
  );
  const row = rows.find((r) => String(r.dos_supp_1_ft || "").trim());
  return row ? row.dos_supp_1_ft.trim() : null;
}

// Wrapper avec connexion dédiée pour fetchDossierFormatPlaque, sur le modèle de getDossierDate.
async function getDossierFormatPlaque(commande) {
  const connection = await getDbConnection();
  try {
    return await fetchDossierFormatPlaque(connection, commande);
  } finally {
    await closeConnection(connection);
  }
}

module.exports = {
  listDossiers,
  listCommandesAvecProfilsKits,
  listCommandesRecentes,
  groupCandidatesFromRows,
  groupAllCandidatesFromRows,
  searchDossiers,
  getDossierDetail,
  getDossierDate,
  fetchDossierDate,
  fetchDossierLivraisonDates,
  getDossierLivraisonDates,
  fetchDossierPrixTotal,
  getDossierPrixTotal,
  fetchDossierCommandeInfo,
  getDossierCommandeInfo,
  fetchDossierFormatPlaque,
  getDossierFormatPlaque,
  mapDosClientToAppClient,
  fetchEnteteDevis,
  extractDimensionFormat,
  extractModelFromIdentif,
  buildVisualReferences,
  fetchSousDossiersVisuels,
  findStockReferences,
};
