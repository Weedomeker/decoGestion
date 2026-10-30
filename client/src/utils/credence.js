import { findFormatTauro } from "./formatTauro.js";

// Pas de \b : "_" est un caractère de mot, donc \b échouait sur le dossier CASTO "2_300x60"
const CREDENCE_RE = /(?<!\d)\d{3}x\d{2}(?!\d)/i;

export function isCredenceFormat(format) {
  return format ? CREDENCE_RE.test(format) : false;
}

// Finition déduite du nom du visuel (même règle que la validation à la soumission)
export function getFinition(visuel) {
  if (!visuel) return null;
  if (/brillant/i.test(visuel)) return "BRILLANT";
  if (/mat/i.test(visuel)) return "MAT";
  return null;
}

export function finitionsCompatibles(v1, v2) {
  const f1 = getFinition(v1);
  const f2 = getFinition(v2);
  return !f1 || !f2 || f1 === f2;
}

// Crédence BRICO/CASTO 1 ex : doit être amalgamée (2e visuel ou complément stock)
export function needsCredencePartner(job) {
  return !!job.isCredence && (job.client === "BRICO" || job.client === "CASTO") && Number(job.ex) === 1;
}

function credenceDims(format) {
  const match = String(format || "").match(/(?<!\d)(\d{3})x(\d{2})(?!\d)/i);
  return match ? { length: Number(match[1]), width: Number(match[2]) } : null;
}

// Plaque pour 2 crédences amalgamées : garde la plaque courante si elle contient les 2 panneaux
// côte à côte, sinon la plus petite qui les contient (255x60 + 300x60 en 126x260 → 150x305).
// Même règle que le refus 400 de add_job (server/src/utils/credencePlaque.js).
export function plaqueCredences(formatTauro, plaque, format1, format2) {
  const p1 = credenceDims(format1);
  const p2 = credenceDims(format2);
  if (!p1 || !p2) return plaque;
  const width = p1.width + p2.width;
  const height = Math.max(p1.length, p2.length);
  const current = String(plaque || "").match(/(\d{2,4})x(\d{2,4})/i);
  if (current && Number(current[1]) >= width && Number(current[2]) >= height) return plaque;
  return findFormatTauro(formatTauro, `${width}x${height}`) || plaque;
}

export function visuelLabel(file) {
  return file?.name?.split("/").pop().replace(/\.[^/.]+$/, "") || "";
}
