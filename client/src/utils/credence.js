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

export function visuelLabel(file) {
  return file?.name?.split("/").pop().replace(/\.[^/.]+$/, "") || "";
}
