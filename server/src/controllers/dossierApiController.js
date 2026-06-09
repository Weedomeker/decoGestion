const dossierService = require("../gamesys/services/dossierService");

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

function normalizeDossierApiPayload(payload) {
  const warnings = [];
  const sousDossiers = Array.isArray(payload?.sousDossiers) ? payload.sousDossiers : [];

  const visualJobs = sousDossiers.flatMap((sousDossier) => {
    const visualReferences = Array.isArray(sousDossier?.visualReferences) ? sousDossier.visualReferences : [];
    if (visualReferences.length === 0) return [];

    const livraison = Array.isArray(sousDossier?.livraison) ? sousDossier.livraison[0] : null;
    const entete = Array.isArray(sousDossier?.enteteDevis) ? sousDossier.enteteDevis[0] : null;
    const sousNumero = sousDossier?.sousNumero || String(sousDossier?.commande || "").split("/").pop() || "";
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

      return {
        id: `${commande}-${visualRef?.reference || visualIndex}`,
        commande,
        sousNumero,
        numCmd: String(payload?.numero || ""),
        ville: livraison?.bo_ville || livraison?.bo_adlivr_nom_1 || livraison?.bo_ref_de_livraison || "",
        ex: entete?.endv_quant ?? livraison?.bo_quant_livree_total ?? 1,
        reference: visualRef?.reference || visualRef?.articleReference || visualRef?.modele || "",
        articleReference: visualRef?.articleReference || "",
        libelle: visualRef?.libelle || entete?.endv_identif || "",
        formatVisu,
        formatTauro,
        codeTarif: visualRef?.codeTarif || "",
      };
    });
  });

  if (visualJobs.length === 0) {
    warnings.push("Aucun sous-dossier avec visuel n'a été trouvé.");
  }

  return {
    numero: String(payload?.numero || ""),
    client: payload?.clientName || payload?.client || "",
    visualJobs,
    warnings,
  };
}

async function getDossierApi(req, res) {
  const numero = String(req.params.numero || "").trim();

  if (!/^\d+$/.test(numero)) {
    return res.status(400).json({ error: "Numéro de dossier invalide" });
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
