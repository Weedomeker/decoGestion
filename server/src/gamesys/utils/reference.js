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

function getVisualReferenceFromEntete(entete) {
  const explicitReference = [entete?.endv_ref_client, entete?.endv_no_modele, entete?.endv_code_complet_modele].find(
    (value) => value && String(value).trim(),
  );

  if (explicitReference) return String(explicitReference).trim();

  const noCcMatch = String(entete?.endv_rmq || "").match(/\bNO\s*CC\s*[:#-]?\s*([0-9]{3,})\b/i);
  return noCcMatch?.[1] || "";
}

module.exports = {
  normalizeSearchText,
  getSearchTerms,
  getProfileSearchTerms,
  isProfileLabel,
  isKitPoseLabel,
  isNumericReference,
  getVisualReferenceFromEntete,
};
