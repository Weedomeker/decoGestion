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
  // "ANGLE" ne distingue un SKU que pour les cornières (CORNR vs CHAMP) : le catalogue stock des
  // profilés classiques ne l'écrit jamais (il dit juste "Intérieur"/"Extérieur"), donc l'imposer
  // en AND pour un profilé fait échouer la recherche à coup sûr (ex: "PROFILE ANGLE INTERIEUR
  // NOIR MAT 255cm" ne matchait jamais la ref 94964473, "PROFILE Noir Mat - C - Intérieur - 255cm").
  if (isCorniere && normalized.includes("ANGLE")) terms.push("ANGLE");
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

// Une ligne de devis "visuel" est tout ce qui n'est ni un profilé/cornière ni un kit de pose —
// même distinction que celle déjà faite en dur dans buildVisualReferences (dossierService.js).
function isVisualLabel(value) {
  return !isProfileLabel(value) && !isKitPoseLabel(value);
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

// Détecte une orientation (panneau miroir Gauche/Droit/Centre du même visuel/format) à partir du
// nom du visuel ou de sa référence. Deux visuels miroir peuvent avoir un prix différent sans aucun
// autre moyen de les distinguer (endv_ref_client vide, même libellé sauf l'orientation) — cas réel
// constaté (ex: commande 166212, "Hokusai Droit" 283,51€ vs "Hokusai Gauche" 557,35€, avec des refs
// Mongo "HOKUSAID-150210"/"HOKUSAIG-150210" qui codent l'orientation en suffixe mais n'apparaissent
// dans aucun champ explicite du devis Gamesys). Le nom du visuel (deco) porte parfois l'orientation
// en toutes lettres ; à défaut, on regarde le suffixe D/G juste avant le tiret-format de la ref.
function extractOrientationHint(ref, deco) {
  const text = normalizeSearchText(deco || "");
  if (/\bGAUCHE\b/.test(text)) return "GAUCHE";
  if (/\bDROIT/.test(text)) return "DROIT";
  if (/\bCENTRE\b/.test(text)) return "CENTRE";

  const match = /([DG])-\d+$/i.exec(String(ref || "").trim());
  if (match) return match[1].toUpperCase() === "D" ? "DROIT" : "GAUCHE";

  return null;
}

// Stem court (résiste à la faute de frappe "DROT" au lieu de "DROIT" constatée en donnée réelle).
const ORIENTATION_STEMS = { GAUCHE: "GAU", DROIT: "DRO", CENTRE: "CEN" };

function labelMatchesOrientation(label, orientation) {
  if (!orientation) return true;
  const stem = ORIENTATION_STEMS[orientation];
  return stem ? normalizeSearchText(label).includes(stem) : true;
}

module.exports = {
  normalizeSearchText,
  getSearchTerms,
  getProfileSearchTerms,
  isProfileLabel,
  isKitPoseLabel,
  isVisualLabel,
  isNumericReference,
  isTeinteMasseModel,
  getVisualReferenceFromEntete,
  extractOrientationHint,
  labelMatchesOrientation,
};
