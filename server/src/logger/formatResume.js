// Met en forme un objet résumé de sync/backfill ({ candidats: 130, dejaExistants: 130, ... }) en
// texte lisible pour les logs : "130 candidats · 130 déjà existants · 0 créé". Les clés inconnues
// sont affichées telles quelles ; les champs non numériques sont ignorés.
const LABELS = {
  candidats: ["candidat", "candidats"],
  dejaExistants: ["déjà existant", "déjà existants"],
  crees: ["créé", "créés"],
  traites: ["traité", "traités"],
  misAJour: ["mis à jour", "mis à jour"],
  annules: ["annulé", "annulés"],
  introuvables: ["introuvable", "introuvables"],
  erreurs: ["erreur", "erreurs"],
};

function formatResume(resume) {
  if (!resume || typeof resume !== "object") return String(resume);
  if (resume.candidats === 0) return "rien à traiter";

  return Object.entries(resume)
    .filter(([, value]) => typeof value === "number")
    .map(([key, value]) => {
      const [singulier, pluriel] = LABELS[key] || [key, key];
      return `${value} ${value > 1 ? pluriel : singulier}`;
    })
    .join(" · ");
}

module.exports = { formatResume };
