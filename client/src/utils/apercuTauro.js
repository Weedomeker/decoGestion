// Textes courts de l'aperçu « Lancer en session / hors session » (ApercuSessionTauro).
// Le serveur renvoie des motifs détaillés (lancement-tauro.js) : on les résume pour l'opérateur.

/**
 * « MAT : 20 ex. restants, pas de quoi faire une session de 50 ex. — non lancé, … »
 *   -> « pas de quoi faire une session de 50 ex. » (le nombre d'ex. est affiché à part)
 */
export function motifCourt(raison) {
  return String(raison || "")
    .split(" — ")[0]
    .replace(/^(MAT|BRI) : /, "")
    .replace(/^\d+ ex\. restants,?\s*/, "")
    .replace(/^seulement \d+ ex\.\s*/, "")
    .replace(/^\((.*)\)$/, "$1")
    .trim();
}

/** Jobs triés dans l'ordre d'impression (n° en tête du nom) */
export const dansOrdreImpression = (jobs) => [...jobs].sort((a, b) => String(a.nom).localeCompare(String(b.nom)));

/** Ex. cumulés par commande, dans l'ordre d'apparition : « 169855 (2), 169856 (1) » */
export function listeDossiers(items) {
  const parCmd = new Map();
  for (const it of items) parCmd.set(String(it.cmd), (parCmd.get(String(it.cmd)) || 0) + (Number(it.ex) || 0));
  return [...parCmd].map(([cmd, ex]) => `${cmd} (${ex})`).join(", ");
}

/** Une ligne par motif : { motif, ex, jobs, dossiers } */
export function regrouperParMotif(items) {
  const groupes = new Map();
  for (const it of items) {
    const motif = motifCourt(it.raison);
    (groupes.get(motif) || groupes.set(motif, []).get(motif)).push(it);
  }
  return [...groupes].map(([motif, liste]) => ({
    motif,
    ex: liste.reduce((t, it) => t + (Number(it.ex) || 0), 0),
    jobs: liste.length,
    dossiers: listeDossiers(liste),
  }));
}

/**
 * « déjà lancé le 17/11/2026 (002_S1711A_…_20) — identique : à confirmer (relancer …) »
 *   -> « déjà lancé le 17/11/2026 (S1711A n° 002), identique »
 * Un lancement hors session (nom d'origine) devient « (hors session) ». Autre motif : inchangé.
 */
export function blocageCourt(raison) {
  const m = /^déjà lancé le (\S+) \((.+)\) — (identique|MODIFIÉ depuis : (.+?)) : à confirmer/.exec(
    String(raison || ""),
  );
  if (!m) return String(raison || "");
  const session = /^(\d{3})_(S\d{4}[A-Z])_/.exec(m[2]);
  const ou = session ? `${session[2]} n° ${session[1]}` : "hors session";
  return `déjà lancé le ${m[1]} (${ou}), ${m[4] ? `modifié depuis : ${m[4]}` : "identique"}`;
}

/** Jobs d'une session (ordre d'impression) -> « 151x260 → 126x260 → 101x215 · 21 avec blanc » */
export function resumeFormats(jobs) {
  const formats = [
    ...new Set(
      dansOrdreImpression(jobs)
        .map((j) => j.format)
        .filter(Boolean),
    ),
  ];
  const blancs = jobs.filter((j) => j.blanc === "W").length;
  return `${formats.join(" → ")} · ${blancs ? `${blancs} avec blanc` : "sans blanc"}`;
}
