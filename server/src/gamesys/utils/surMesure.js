const { isTeinteMasseModel } = require("./reference");

// dé-accente + majuscules, sans toucher aux espaces/x
function deaccentUpper(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

const SUR_MESURE_LABEL_RE = /^\s*(?:PANNEAU\s+DECO\s+SUR[-\s]?MESURE\b|FORMAT\s+FINI\s*:)/;

function isSurMesureLabel(endvIdentif) {
  if (!endvIdentif) return false;
  return SUR_MESURE_LABEL_RE.test(deaccentUpper(endvIdentif));
}

const FINITIONS = ["LISSE", "TEXTUREE", "COULEUR", "BROSSE"];
const FINITION_BY_CODE = { L: "LISSE", T: "TEXTUREE", C: "COULEUR", B: "BROSSE" };

function normFormat(w, h) {
  const nw = Number(w);
  const nh = Number(h);
  if (!Number.isFinite(nw) || !Number.isFinite(nh)) return "";
  const cw = nw > 500 ? Math.round(nw / 10) : Math.round(nw);
  const ch = nh > 500 ? Math.round(nh / 10) : Math.round(nh);
  return `${cw}x${ch}`;
}

function parseSurMesureGabarit(endvIdentif, stockCodeTarif) {
  const text = deaccentUpper(endvIdentif);

  let format = "";
  const m = text.match(/(\d{2,4}(?:\.\d+)?)\s*X\s*(\d{2,4}(?:\.\d+)?)/);
  if (m) format = normFormat(m[1], m[2]);

  let finition = "";
  // ce qui reste après les dimensions (+ 'CM' optionnel), sans le mot 'FINITION'
  const tail = text
    .replace(/^.*?\d{2,4}(?:\.\d+)?\s*X\s*\d{2,4}(?:\.\d+)?\s*(?:CM)?\s*/, "")
    .replace(/^FINITION\s+/, "")
    .trim();
  if (FINITIONS.includes(tail)) finition = tail;

  if (!finition && stockCodeTarif) {
    const cm = deaccentUpper(stockCodeTarif).match(/-SM\d+X\d+([LTCB])$/);
    if (cm) finition = FINITION_BY_CODE[cm[1]];
  }

  return { format, finition };
}

// Orientation dans endv_ref_client : texte libre Gamesys très inconstant — le mot peut être collé aux
// dimensions ("100X210DROITE"), doublé ("DROITE DROITE"), ou placé avant/après la cote. Les frontières
// ne portent donc que sur des lettres (les chiffres et espaces sont des séparateurs valides), pas sur
// le `\b` standard qui échoue sur "210DROITE". DROITE/DROT → DROIT (forme canonique).
const ORIENTATION_RE = /(?<![A-Z])(GAUCHE|DROITE|DROIT|DROT|CENTRE)(?![A-Z])/g;

function canonOrientation(word) {
  if (word === "DROITE" || word === "DROT") return "DROIT";
  return word;
}

function parseSurMesureRefClient(endvRefClient) {
  const raw = String(endvRefClient || "").trim();
  if (!raw) return { name: "", orientation: null, printFormat: null, finishHint: null };

  const upper = deaccentUpper(raw);

  const orientMatch = upper.match(ORIENTATION_RE);
  const orientation = orientMatch ? canonOrientation(orientMatch[0]) : null;

  let printFormat = null;
  const pf = upper.match(/(\d+(?:[.,]\d+)?)\s*X\s*(\d+(?:[.,]\d+)?)/);
  // printFormat: cote client brute (souvent décimale, ex 86.9x201.5) — volontairement NON normalisée
  // mm→cm contrairement à format ; sert uniquement au commentaire "Cote client" et à la clé de dédup front.
  if (pf) printFormat = `${pf[1].replace(",", ".")}x${pf[2].replace(",", ".")}`;

  let finishHint = null;
  if (/\bBRILLANT\b/.test(upper)) finishHint = "BRILLANT";
  else if (/\bMAT\b/.test(upper)) finishHint = "MAT";

  const name = upper
    .replace(ORIENTATION_RE, " ")
    .replace(/\d+(?:[.,]\d+)?\s*X\s*\d+(?:[.,]\d+)?/g, " ")
    .replace(/\b(?:MAT|BRILLANT|CM)\b/g, " ")
    .replace(/\s*\+\s*/g, " ") // amalgame "MASSA ... + MASSA ..." → un seul segment
    .replace(/\b([A-Z][A-Z']*)(?:\s+\1\b)+/g, "$1") // dédoublonne un mot répété ("MASSA MASSA" → "MASSA")
    .replace(/\s+/g, " ")
    .trim();

  return { name, orientation, printFormat, finishHint };
}

function classifySurMesure(arg) {
  const { name } = arg || {};
  return isTeinteMasseModel(name) ? "teinte_masse" : "visuel";
}

module.exports = {
  isSurMesureLabel,
  parseSurMesureGabarit,
  parseSurMesureRefClient,
  classifySurMesure,
};
