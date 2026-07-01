function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(\d+)\s*[xX]\s*(\d+)/g, "$1 $2")
    .replace(/(\d+)\s*(CM|MM)\b/gi, "$1")
    .toUpperCase();
}

function getSearchTerms(label) {
  return (
    String(label || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/(\d+)\s*[xX]\s*(\d+)/g, "$1 $2")
      .replace(/(\d+)\s*(CM|MM)\b/gi, "$1")
      .toUpperCase()
      .match(/[A-Z0-9]+/g)
      ?.filter((term) => term.length >= 3 || /^\d+$/.test(term))
      .filter((term) => !["MAT", "THE", "LES"].includes(term))
      .slice(0, 6) || []
  );
}

function getProfileSearchTerms(label) {
  const normalized = normalizeSearchText(label);
  const terms = ["PROFILE"];

  if (normalized.includes("BLANC")) terms.push("BLANC");
  if (normalized.includes("NOIR")) terms.push("NOIR");
  if (normalized.includes("ALU")) terms.push("ALU");
  if (normalized.includes("OR")) terms.push("OR");
  if (normalized.includes("255")) terms.push("255");
  if (normalized.includes("210")) terms.push("210");

  if (normalized.includes("FINITION")) terms.push(" A ");
  if (normalized.includes("RACCORD")) terms.push(" B ");
  if (normalized.includes("INTERIEUR")) terms.push(" C ");
  if (normalized.includes("EXTERIEUR")) terms.push(" D ");

  if (normalized.includes("CORNIERE")) terms.push("CORNIERE");

  return terms;
}

function isProfileLabel(value) {
  return /\b(PROFIL(ES|E|S)?|CORNIERE)\b/.test(normalizeSearchText(value));
}

function isKitPoseLabel(value) {
  const text = normalizeSearchText(value).replace(/\s+/g, "").trim();
  return /(?:KITPOSE|KITDEPOSE)/.test(text);
}

function isNumericReference(value) {
  return /^\d+$/.test(String(value || ""));
}

// Liste exhaustive des modèles "teinte masse" — solides sans fichier visuel associé.
// Source de vérité : TeinteMasseDropdown.jsx (côté client).
const TEINTE_MASSE_MODELS = [
  "NOIR ZERO",
  "BLANC ZERO",
  "GRANIT 3",
  "ALU BROSSE",
  "BRONZE BROSSE",
  "CUIVRE BROSSE",
  "NOIR BROSSE",
  "OR BROSSE",
];

function isTeinteMasseModel(model) {
  const normalized = normalizeSearchText(model);
  return TEINTE_MASSE_MODELS.some((tm) => normalized === tm || normalized.startsWith(`${tm  } `));
}

// Un numéro de commande client ("NO CC" dans endv_rmq) n'est structurellement jamais une
// référence produit — ne dériver une référence QUE des champs explicites du devis.
function getVisualReferenceFromEntete(entete) {
  const explicitReference = [entete?.endv_ref_client, entete?.endv_no_modele, entete?.endv_code_complet_modele].find(
    (value) => value && String(value).trim(),
  );

  return explicitReference ? String(explicitReference).trim() : "";
}

module.exports = {
  normalizeSearchText,
  getSearchTerms,
  getProfileSearchTerms,
  isProfileLabel,
  isKitPoseLabel,
  isNumericReference,
  isTeinteMasseModel,
  getVisualReferenceFromEntete,
};
