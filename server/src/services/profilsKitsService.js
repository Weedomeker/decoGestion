const logger = require("../logger/logger");
// Import via objet module (pas destructuré) pour permettre le stub sinon en test
const dossierService = require("../gamesys/services/dossierService");
const {
  isProfileLabel,
  isKitPoseLabel,
  normalizeSearchText,
  extractOrientationHint,
  labelMatchesOrientation,
} = require("../gamesys/utils/reference");
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

// Total d'une commande "profils/kits seulement" (pkOnly) — pas de visuel dans ce cas, donc pas de
// prix par visuel possible, mais le total des articles (déjà résolus via getPrixForArticle
// ci-dessus) donne le prix réel de la commande. undefined si aucun article n'a de prix exploitable
// (à distinguer d'un total à 0) — mêmes filtres que getPrixForArticle.
function sumArticlesPrix(articles) {
  const values = (articles || [])
    .map((a) => a.prix)
    .filter((px) => px !== null && px !== undefined)
    .map((px) => Number(px))
    .filter((px) => Number.isFinite(px));
  return values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100 : undefined;
}

// Prix Gamesys d'un visuel décoratif précis (pas un profil/kit) — même principe que
// getPrixForArticle, mais la ligne fd_entete_devi recherchée est retrouvée via
// grouped.visualReferences (déjà résolu par buildVisualReferences en amont) plutôt que via un
// libellé passé directement, car un visuel n'a pas d'équivalent à profileReferences/kitPosesReferences
// côté appelant (saveDeco ne dispose que de cmd/ref/deco, pas des sousDossiers).
async function getPrixVisuel({ cmd, ref, deco, format, soleDoc = false }) {
  if (!cmd) return undefined;
  let grouped;
  try {
    grouped = await dossierService.getDossierDetail({ commande: String(cmd), view: "summary" });
  } catch (err) {
    logger.warn(`getPrixVisuel: getDossierDetail échoué pour cmd=${cmd} : ${err.message}`);
    return undefined;
  }

  const visualReferences = grouped.visualReferences || [];
  const safeRef = ref ? String(ref).toUpperCase() : null;
  let matched = safeRef
    ? visualReferences.find((v) => String(v.reference || "").toUpperCase() === safeRef)
    : null;

  if (!matched && deco) {
    const normDeco = normalizeSearchText(deco);
    // Le nom descriptif du visuel se trouve dans v.libelle (= endv_identif) pour les références
    // catalogue, mais dans v.reference (dérivé de endv_ref_client, cf. buildVisualReferences) pour
    // les panneaux sur-mesure/certaines gammes — endv_identif y est alors un libellé générique type
    // "Format fini : ..." ou "Panneau déco sur-mesure ..." (cas réels commandes 167500/167431, voir
    // decoPrixVisuelBackfillService.js). On cherche donc dans les deux champs.
    let candidates = visualReferences.filter((v) => {
      const normLibelle = normalizeSearchText(v.libelle || "");
      const normReference = normalizeSearchText(v.reference || "");
      return (
        (normLibelle && (normLibelle.includes(normDeco) || normDeco.includes(normLibelle))) ||
        (normReference && (normReference.includes(normDeco) || normDeco.includes(normReference)))
      );
    });

    // Plusieurs visuels peuvent partager le même nom mais représenter des formats différents
    // (ex: "JARDIN SECRET GAUCHE 100x255cm" vs "... 150x255cm") — sans référence explicite pour les
    // départager, le format déjà résolu pour ce job permet de lever l'ambiguïté puisque le libellé
    // Gamesys l'inclut généralement. Gamesys sépare les décimales par '.', la saisie manuelle Mongo
    // parfois par ',' (FR) : on aligne avant de comparer.
    if (candidates.length > 1 && format) {
      const normFormat = normalizeSearchText(String(format).replace(/,/g, "."));
      const narrowed = candidates.filter(
        (v) =>
          normalizeSearchText(v.libelle || "").includes(normFormat) ||
          normalizeSearchText(v.reference || "").includes(normFormat),
      );
      if (narrowed.length > 0) candidates = narrowed;
    }

    // Deux panneaux miroir (Gauche/Droit/Centre) du même visuel et même format peuvent avoir un prix
    // différent — l'orientation n'apparaît pas toujours dans deco, mais est parfois encodée en
    // suffixe dans ref (ex: "HOKUSAID-150210"/"HOKUSAIG-150210"). Voir decoPrixVisuelBackfillService.js.
    if (candidates.length > 1) {
      const orientation = extractOrientationHint(ref, deco);
      if (orientation) {
        const narrowed = candidates.filter(
          (v) => labelMatchesOrientation(v.libelle || "", orientation) || labelMatchesOrientation(v.reference || "", orientation),
        );
        if (narrowed.length > 0) candidates = narrowed;
      }
    }

    matched = candidates[0];
  }

  // Dossier avec un seul visuel Gamesys et aucun autre document Deco possible pour ce numCmd (pas
  // une crédence amalgamée) : aucune ambiguïté à lever, le prix de cette unique ligne EST le prix
  // cherché même si le texte ne matche pas (cas réel commande 167637, terrazzo gris / TERRAZZO GR
  // BEIGE — Gamesys abrège/reformule différemment). `soleDoc` doit être vrai pour éviter d'assigner
  // le même prix aux deux visuels d'une crédence BRICO/CASTO (2 documents Deco pour un même numCmd,
  // cf. CLAUDE.md) si Gamesys ne facture ce cas qu'avec une seule ligne de devis — voir
  // decoPrixVisuelBackfillService.js:matchPrixVisuel pour le même correctif côté backfill.
  if (!matched && soleDoc && visualReferences.length === 1) {
    matched = visualReferences[0];
  }

  if (!matched) return undefined;
  // Prix lu directement sur l'entrée matchée (endv_px_total porté par buildVisualReferences) plutôt
  // que re-résolu via getPrixForArticle par libellé : quand plusieurs lignes fd_entete_devi partagent
  // le même endv_identif générique (cas BAMBUSA ci-dessus), une re-résolution par libellé les
  // additionnerait toutes au lieu de ne garder que celle effectivement matchée (même correctif que
  // decoPrixVisuelBackfillService.js:matchPrixVisuel).
  const prix = Number(matched.endv_px_total);
  return Number.isFinite(prix) ? prix : undefined;
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
            prixTotal: sumArticlesPrix(articles),
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

module.exports = { saveProfilsKits, getQtyForArticle, getPrixForArticle, getPrixVisuel, sumArticlesPrix };
