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
const { cleanDbValue, pickFields, uniqueBy, countRows } = require("../utils/data");

async function findStockReferences(connection, enteteDevis) {
  const identif = enteteDevis[0]?.endv_identif || "";
  if (isKitPoseLabel(identif)) {
    const rows = await query(
      connection,
      `
        select
          st_seq,
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
        where st_code_tarif = 'KITPOSE' and st_lib_1_conso = 'KIT DE POSE'
        order by st_seq desc
        limit 25
      `
    );

    return rows.map((row) => ({
      reference: row.st_art_ref_client || row.st_modele,
      modele: row.st_modele,
      libelle: [row.st_lib_1_conso, row.st_lib_2_conso].filter(Boolean).join(" - "),
      gencod: row.st_art_gencod,
      codeTarif: row.st_code_tarif,
      famille: row.st_art_famille,
      sousFamille: row.st_art_sfamille,
      type: row.st_type,
      source: "fs_stock",
    }));
  }

  const terms = isProfileLabel(identif) ? getProfileSearchTerms(identif) : getSearchTerms(identif);
  const numericTerms = terms.filter((term) => /^\d+$/.test(term));
  const firstLabelTerm = terms.find((term) => /^[A-Z]+$/.test(term));
  const candidateTerms = isProfileLabel(identif) ? terms : [firstLabelTerm, ...numericTerms];
  const usefulTerms = candidateTerms
    .filter(Boolean)
    .filter((term) => !["CM", "MM"].includes(term));

  if (usefulTerms.length < 2) return [];

  const likeParams = [];
  const where = usefulTerms
    .map((term) => {
      const likeVal = `%${escapeSqlLike(term)}%`;
      likeParams.push(likeVal, likeVal, likeVal, likeVal);
      return `(upper(st_lib_1_conso) like ? ESCAPE '\\' or upper(st_lib_2_conso) like ? ESCAPE '\\' or upper(st_art_ref_client) like ? ESCAPE '\\' or upper(st_modele) like ? ESCAPE '\\')`;
    })
    .join(" and ");

  const rows = await query(
    connection,
    `
      select
        st_seq,
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
      where ${where}
      order by st_seq desc
      limit 25
    `,
    likeParams
  );

  const exactRows = rows.filter((row) => {
    const haystack = normalizeSearchText([
      row.st_lib_1_conso,
      row.st_lib_2_conso,
      row.st_art_ref_client,
    ].filter(Boolean).join(" "));
    return terms.every((term) => haystack.includes(term));
  });

  const selectedRows = exactRows.length ? exactRows : rows.slice(0, 5);

  return selectedRows.map((row) => ({
    reference: row.st_art_ref_client || row.st_modele,
    modele: row.st_modele,
    libelle: [row.st_lib_1_conso, row.st_lib_2_conso].filter(Boolean).join(" - "),
    gencod: row.st_art_gencod,
    codeTarif: row.st_code_tarif,
    famille: row.st_art_famille,
    sousFamille: row.st_art_sfamille,
    type: row.st_type,
    source: "fs_stock",
  }));
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

function buildVisualReferences(enteteDevis, stockVisualReferences) {
  return uniqueBy(
    (enteteDevis || [])
      .map((entete) => {
        if (isProfileLabel(entete.endv_identif)) return null;
        if (isKitPoseLabel(entete.endv_identif)) return null;

        const stockReference = stockVisualReferences?.find((stock) => {
          const stockText = normalizeSearchText([
            stock.libelle,
            stock.codeTarif,
            stock.reference,
            stock.modele,
          ].filter(Boolean).join(" "));
          const enteteText = normalizeSearchText(entete.endv_identif);
          return enteteText && stockText.includes(enteteText);
        }) || stockVisualReferences?.[0];

        const explicitReference = getVisualReferenceFromEntete(entete);
        const reference = stockReference?.reference || stockReference?.modele || explicitReference || entete.endv_identif;
        if (!reference) return null;

        return {
          reference,
          libelle: entete.endv_identif || stockReference?.libelle || reference,
          articleReference: stockReference?.reference,
          modele: stockReference?.modele,
          gencod: stockReference?.gencod,
          codeTarif: stockReference?.codeTarif,
          famille: stockReference?.famille,
          sousFamille: stockReference?.sousFamille,
          type: stockReference?.type,
          source: stockReference ? "fs_stock" : "fd_entete_devi",
          category: "visuel",
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
    let client = first.dossier?.dos_client || first.enteteDevis?.[0]?.endv_cclient;
    let client_name = ['LM', 'BM', 'CAS', 'ECOM'];
    for (const name of client_name) {
      if (String(client).startsWith(name)) {
        clientName = name;
        break;
      }
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

async function fetchEnteteDevis(connection, commande, code) {
  try {
    return await query(
      connection,
      `select * from public.fd_entete_devi where endv_no_dossier = ? or endv_no_commande = ? or endv_no_cmde_globale = ? or endv_no_dossier_site_donneur = ? or endv_coduniq = ?`,
      [commande, commande, commande, commande, code]
    );
  } catch (error) {
    logger.warn(`Erreur entête devis: ${error.message}`);
    return [];
  }
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
    const enteteDevis = await fetchEnteteDevis(connection, dossierCommande, dossierCode);
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
    const stockReferences = await findStockReferences(connection, primary.enteteDevis);
    const categorizedReferences = splitVisualAndProfileReferences(stockReferences);
    visualReferences = buildVisualReferences(primary.enteteDevis, categorizedReferences.visuals);
    profileReferences = buildProfileReferences(primary.enteteDevis, categorizedReferences.profiles);
    kitPosesReferences = buildKitPoseReferences(primary.enteteDevis, categorizedReferences.kitPoses);
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

module.exports = {
  listDossiers,
  searchDossiers,
  getDossierDetail,
};
