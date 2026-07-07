const dossierService = require("../gamesys/services/dossierService");
const { getOdbcStatus } = require("../gamesys/config/db");
const { getQtyForArticle } = require("../services/profilsKitsService");
const { isProfileLabel, isKitPoseLabel } = require("../gamesys/utils/reference");

function parseFormat(value) {
  if (!value) return "";

  const match = String(value).match(/(\d{2,4})\s*x\s*(\d{2,4})/i);
  if (!match) return "";

  const width = Number(match[1]);
  const height = Number(match[2]);

  if (!Number.isFinite(width) || !Number.isFinite(height)) return "";

  const normalizedWidth = width > 500 ? Math.round(width / 10) : width;
  const normalizedHeight = height > 500 ? Math.round(height / 10) : height;

  return `${normalizedWidth}x${normalizedHeight}`;
}

function extractVisualFormat(visualRef, sousDossier) {
  return (
    parseFormat(visualRef?.libelle) ||
    parseFormat(visualRef?.codeTarif) ||
    parseFormat(sousDossier?.dossier?.dos_imp_1_ele) ||
    parseFormat(sousDossier?.dossier?.dos_forme_et_format)
  );
}

function extractTauroFormat(sousDossier) {
  return (
    parseFormat(sousDossier?.dossier?.dos_supp_1_ft_imp) ||
    parseFormat(sousDossier?.dossier?.dos_supp_1_lib_2) ||
    parseFormat(sousDossier?.dossier?.dos_supp_1_lib_1)
  );
}

// Si la référence résolue est un code LM (8 chiffres), le client est LM même si codeTarif indique "EC-".
// Si la référence reste alphanum ET codeTarif commence par "EC-", le visuel est du catalogue ECOM.
function detectVisuClient(visualRef, defaultClient) {
  const ref = visualRef?.reference || visualRef?.articleReference || "";
  if (/^\d{8}$/.test(ref)) return defaultClient;
  if (/^EC-/i.test(visualRef?.codeTarif || "")) return "ECOM";
  return defaultClient;
}

function normalizeDossierApiPayload(payload) {
  const warnings = [];
  const sousDossiers = Array.isArray(payload?.sousDossiers) ? payload.sousDossiers : [];

  const visualJobs = sousDossiers.flatMap((sousDossier) => {
    const visualReferences = Array.isArray(sousDossier?.visualReferences) ? sousDossier.visualReferences : [];
    if (visualReferences.length === 0) return [];

    const livraison = Array.isArray(sousDossier?.livraison) ? sousDossier.livraison[0] : null;
    const entete = Array.isArray(sousDossier?.enteteDevis) ? sousDossier.enteteDevis[0] : null;
    const sousNumero =
      sousDossier?.sousNumero ||
      String(sousDossier?.commande || "")
        .split("/")
        .pop() ||
      "";
    const commande = sousDossier?.commande || `${payload?.numero || ""}/${sousNumero}`;

    return visualReferences.map((visualRef, visualIndex) => {
      const formatVisu = extractVisualFormat(visualRef, sousDossier);
      const formatTauro = extractTauroFormat(sousDossier);

      if (!formatVisu) {
        warnings.push(`Format visuel introuvable pour ${commande}`);
      }

      if (!formatTauro) {
        warnings.push(`Format plaque introuvable pour ${commande}`);
      }

      const libelle = visualRef?.libelle || entete?.endv_identif || "";
      const reference = visualRef?.reference || visualRef?.articleReference || visualRef?.modele || "";
      const defaultClient = payload?.clientName || payload?.client || "";
      const clientVisu = detectVisuClient(visualRef, defaultClient);

      if (reference && reference === libelle) {
        warnings.push(`Référence fallback sur libellé brut pour ${commande} : "${libelle}"`);
      }

      return {
        id: `${commande}-${visualIndex}-${reference || ""}`,
        commande,
        sousNumero,
        numCmd: String(payload?.numero || ""),
        ville:
          payload.clientName === "ECOM"
            ? livraison?.bo_adlivr_nom_1 || livraison?.bo_ref_de_livraison || livraison?.bo_ville || ""
            : livraison?.bo_ville || livraison?.bo_adlivr_nom_1 || livraison?.bo_ref_de_livraison || "",
        ex: entete?.endv_quant ?? livraison?.bo_quant_livree_total ?? 1,
        reference,
        articleReference: visualRef?.articleReference || "",
        modele: visualRef?.modele || "",
        libelle,
        formatVisu,
        formatTauro,
        codeTarif: visualRef?.codeTarif || "",
        clientVisu: clientVisu !== defaultClient ? clientVisu : undefined,
      };
    });
  });

  if (visualJobs.length === 0) {
    warnings.push("Aucun sous-dossier avec visuel n'a été trouvé.");
  }

  const profileRefs = payload?.profileReferences || [];
  const kitRefs = payload?.kitPosesReferences || [];

  const numero = String(payload?.numero || "");
  const pkClient = payload?.clientName || payload?.client || "";
  const pkVille = (() => {
    const firstLiv = sousDossiers[0]?.livraison?.[0];
    return firstLiv?.bo_ville || firstLiv?.bo_adlivr_nom_1 || "";
  })();

  const profilsKitsJobs = [
    ...profileRefs.map((r, i) => ({
      id: `${numero}-profil-${i}`,
      type: "profils_kits",
      numCmd: numero,
      client: pkClient,
      ville: pkVille,
      ref: r.reference || r.modele || r.libelle || "",
      articleType: "profil",
      libelle: r.libelle || "",
      quantite: getQtyForArticle(sousDossiers, isProfileLabel, r.libelle || ""),
    })),
    ...kitRefs.map((r, i) => ({
      id: `${numero}-kit-${i}`,
      type: "profils_kits",
      numCmd: numero,
      client: pkClient,
      ville: pkVille,
      ref: r.reference || r.modele || r.libelle || "",
      articleType: "kit",
      libelle: r.libelle || "",
      quantite: getQtyForArticle(sousDossiers, isKitPoseLabel, r.libelle || ""),
    })),
  ];

  return {
    numero: String(payload?.numero || ""),
    client: payload?.clientName || payload?.client || "",
    visualJobs,
    profilsKitsJobs,
    warnings,
  };
}

async function getDossierApi(req, res) {
  const numero = String(req.params.numero || "").trim();

  if (!/^\d+$/.test(numero)) {
    return res.status(400).json({ error: "Numéro de dossier invalide" });
  }

  if (getOdbcStatus() !== "connected") {
    return res.status(503).json({ error: "Service Gamesys indisponible — connexion ODBC inactive" });
  }

  try {
    const payload = await dossierService.getDossierDetail({ numero, view: "summary" });
    return res.json(normalizeDossierApiPayload(payload));
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Erreur lors de la récupération du dossier",
    });
  }
}

module.exports = {
  getDossierApi,
  normalizeDossierApiPayload,
};
