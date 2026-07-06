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
  // Les cornières sont une famille d'articles Gamesys distincte des profilés de
  // finition : leur libellé stock ne contient jamais le mot "PROFILE", donc
  // l'imposer comme terme AND fait échouer la recherche à coup sûr.
  const isCorniere = normalized.includes("CORNIERE");
  const terms = [isCorniere ? "CORNIERE" : "PROFILE"];

  if (normalized.includes("BLANC")) terms.push("BLANC");
  if (normalized.includes("NOIR")) terms.push("NOIR");
  if (normalized.includes("ALU")) terms.push("ALU");
  if (normalized.includes("OR")) terms.push("OR");
  if (normalized.includes("255")) terms.push("255");
  if (normalized.includes("210")) terms.push("210");
  if (normalized.includes("240")) terms.push("240");
  if (normalized.includes("300")) terms.push("300");
  if (normalized.includes("PLATE")) terms.push("PLATE");
  if (normalized.includes("ANGLE")) terms.push("ANGLE");
  // Finition mutuellement exclusive : sans elle, une commande "Mat" peut matcher un SKU
  // "Brillant" (et inversement) dès que RACCORD/INTERIEUR/etc. existent dans les deux finitions.
  if (normalized.includes("BRILLANT")) terms.push("BRILLANT");
  else if (normalized.includes("MAT")) terms.push("MAT");

  // Mots-clés de variante mutuellement exclusifs : "de finition" est le nom générique de la
  // catégorie chez certains articles legacy (présent dans les 4 variantes), donc le combiner en
  // AND avec RACCORD/INTERIEUR/EXTERIEUR empêcherait toute ligne stock de jamais matcher. On ne
  // garde FINITION que si aucune variante plus précise n'est mentionnée.
  if (normalized.includes("RACCORD")) terms.push("RACCORD");
  else if (normalized.includes("INTERIEUR")) terms.push("INTERIEUR");
  else if (normalized.includes("EXTERIEUR")) terms.push("EXTERIEUR");
  else if (normalized.includes("FERMETURE")) terms.push("FERMETURE");
  else if (normalized.includes("FINITION")) terms.push("FINITION");

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
