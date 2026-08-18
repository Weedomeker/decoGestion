const logger = require("../logger/logger");
// Import via objet module (pas destructuré) pour permettre le stub sinon en test
const dossierService = require("../gamesys/services/dossierService");
const { isProfileLabel, isKitPoseLabel } = require("../gamesys/utils/reference");
const StockProfile = require("../models/StockProfile");
const ConsommationCommande = require("../models/ConsommationCommande");
const Deco = require("../models/Deco");

function getQtyForArticle(sousDossiers, predicate, refLibelle) {
  const allEntetes = (sousDossiers || []).flatMap((s) => s.enteteDevis || []);
  const typeEntetes = allEntetes.filter((e) => predicate(e.endv_identif || ""));
  const distinctLabels = [...new Set(typeEntetes.map((e) => e.endv_identif))];
  if (distinctLabels.length <= 1) {
    return typeEntetes.reduce((sum, e) => sum + (Number(e.endv_quant) || 0), 0);
  }
  const matched = typeEntetes.filter((e) => e.endv_identif === refLibelle);
  return (matched.length ? matched : typeEntetes).reduce((sum, e) => sum + (Number(e.endv_quant) || 0), 0);
}

// Même logique de sélection que getQtyForArticle (par libellé quand plusieurs profils/kits
// distincts existent dans le dossier), mais somme endv_px_total au lieu de endv_quant.
// undefined si aucune ligne retenue n'a de prix exploitable (à distinguer d'un prix de 0) —
// Number(null) vaut 0 en JS, donc on filtre explicitement null/undefined avant conversion.
function getPrixForArticle(sousDossiers, predicate, refLibelle) {
  const allEntetes = (sousDossiers || []).flatMap((s) => s.enteteDevis || []);
  const typeEntetes = allEntetes.filter((e) => predicate(e.endv_identif || ""));
  const distinctLabels = [...new Set(typeEntetes.map((e) => e.endv_identif))];
  const relevant =
    distinctLabels.length <= 1 ? typeEntetes : typeEntetes.filter((e) => e.endv_identif === refLibelle);
  const chosen = relevant.length ? relevant : typeEntetes;
  const values = chosen
    .map((e) => e.endv_px_total)
    .filter((px) => px !== null && px !== undefined)
    .map((px) => Number(px))
    .filter((px) => Number.isFinite(px));
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) : undefined;
}

async function upsertArticle(ref, fields) {
  await StockProfile.findOneAndUpdate(
    { ref },
    {
      $setOnInsert: {
        ref,
        modele: fields.modele || "",
        libelle: fields.libelle || "",
        type: fields.type,
        codeArticle: fields.codeTarif || "",
        famille: fields.famille || "",
        sousFamille: fields.sousFamille || "",
      },
    },
    { upsert: true }
  );
}

async function saveProfilsKits(job) {
  let grouped;
  try {
    grouped = await dossierService.getDossierDetail({ commande: String(job.cmd), view: "summary" });
  } catch (err) {
    logger.warn(`saveProfilsKits: getDossierDetail échoué pour cmd=${job.cmd} : ${err.message}`);
    return;
  }

  const profileReferences = grouped.profileReferences || [];
  const kitPosesReferences = grouped.kitPosesReferences || [];

  if (profileReferences.length === 0 && kitPosesReferences.length === 0) return;

  const articles = [];

  for (const r of profileReferences) {
    const ref = r.reference || r.articleReference || r.modele || r.libelle;
    if (!ref) continue;
    try {
      await upsertArticle(ref, { ...r, type: "profil" });
    } catch (err) {
      logger.warn(`saveProfilsKits: upsert profil ref=${ref} échoué : ${err.message}`);
    }
    articles.push({
      ref,
      type: "profil",
      libelle: r.libelle || "",
      quantite: getQtyForArticle(grouped.sousDossiers, isProfileLabel, r.libelle || ""),
      prix: getPrixForArticle(grouped.sousDossiers, isProfileLabel, r.libelle || ""),
    });
  }

  for (const r of kitPosesReferences) {
    const ref = r.reference || r.articleReference || r.modele || r.libelle;
    if (!ref) continue;
    try {
      await upsertArticle(ref, { ...r, type: "kit" });
    } catch (err) {
      logger.warn(`saveProfilsKits: upsert kit ref=${ref} échoué : ${err.message}`);
    }
    articles.push({
      ref,
      type: "kit",
      libelle: r.libelle || "",
      quantite: getQtyForArticle(grouped.sousDossiers, isKitPoseLabel, r.libelle || ""),
      prix: getPrixForArticle(grouped.sousDossiers, isKitPoseLabel, r.libelle || ""),
    });
  }

  if (articles.length === 0) return;

  const numCmd = parseInt(job.cmd, 10);
  if (!numCmd || isNaN(numCmd)) {
    logger.warn(`saveProfilsKits: numCmd invalide (cmd=${job.cmd}), consommation ignorée`);
    return;
  }

  // dos_date est déjà présent dans les sous-dossiers récupérés par getDossierDetail
  // (view=summary inclut dos_date) — pas besoin d'une requête Gamesys supplémentaire.
  const dossierDate = (grouped.sousDossiers || [])
    .map((s) => s.dossier?.dos_date)
    .find(Boolean);
  const dateCommande = dossierDate ? new Date(dossierDate) : undefined;

  // bo_date_depart_usine / bo_date_souhaitee sont déjà présents dans grouped.sousDossiers[].livraison
  // (view=summary inclut ces champs via ff_livraison) — pas besoin d'une requête Gamesys supplémentaire.
  const livraisonRows = (grouped.sousDossiers || []).flatMap((s) => s.livraison || []);
  const departUsineRaw = livraisonRows.map((l) => l.bo_date_depart_usine).find(Boolean);
  const livraisonSouhaiteeRaw = livraisonRows.map((l) => l.bo_date_souhaitee).find(Boolean);
  const dateDepartUsine = departUsineRaw ? new Date(departUsineRaw) : undefined;
  const dateLivraisonSouhaitee = livraisonSouhaiteeRaw ? new Date(livraisonSouhaiteeRaw) : undefined;

  try {
    const upsertResult = await ConsommationCommande.findOneAndUpdate(
      { numCmd },
      { $setOnInsert: { numCmd, client: job.client, dateCommande, dateDepartUsine, dateLivraisonSouhaitee, articles } },
      { upsert: true, rawResult: true }
    );
    const alreadyExisted = !!upsertResult?.lastErrorObject?.updatedExisting;
    if (alreadyExisted) {
      logger.info(`saveProfilsKits: ConsommationCommande déjà présente pour cmd=${job.cmd}, ignorée`);
      return null;
    }

    if (job.isPkOnly) {
      await Deco.findOneAndUpdate(
        { numCmd, pkOnly: true },
        {
          $setOnInsert: {
            client: job.client,
            numCmd,
            mag: job.ville || "",
            date: new Date(),
            status: "",
            pkOnly: true,
            dateLivraisonSouhaitee,
          },
        },
        { upsert: true }
      );
      logger.info(`saveProfilsKits: entrée lm_commandes pkOnly créée pour cmd=${job.cmd}`);
    }

    return articles;
  } catch (err) {
    logger.warn(`saveProfilsKits: création ConsommationCommande échouée pour cmd=${job.cmd} : ${err.message}`);
  }
}

module.exports = { saveProfilsKits, getQtyForArticle, getPrixForArticle };
