// Affichage de la progression d'un lancement (message WebSocket `progression`, calculée par le serveur).
import { formatDureeMs } from "./duree.js";

export const ETAPES = {
  pdf: "PDF",
  jpg: "JPG",
  depot: "Dépôt",
  base: "Enregistrement",
};

// Entre deux messages, la barre continue à la vitesse annoncée sans dépasser l'étape en cours : un gros PDF
// peut empêcher le serveur d'émettre pendant plusieurs dizaines de secondes.
export function projeter(valeur, vitesse, plafond, ecouleMs) {
  return Math.max(valeur, Math.min(plafond, valeur + (vitesse * Math.max(0, ecouleMs)) / 1000));
}

// « 99 % » tant que le serveur n'a pas annoncé la fin.
export function pourcentageAffiche(progression, ecouleMs) {
  if (progression.phase === "fini") return 100;
  return Math.min(99, Math.floor(projeter(progression.pct, progression.vitesse, progression.plafond, ecouleMs)));
}

export function formatReste(ms) {
  if (ms == null) return "";
  const s = Math.max(0, ms) / 1000;
  if (s < 10) return "~10 s";
  if (s < 60) return `~${Math.ceil(s / 10) * 10} s`;
  return `~${formatDureeMs(Math.ceil(s / 60) * 60000)}`;
}

const heure = (ms) =>
  new Date(ms).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/**
 * Textes et ton du bandeau. `gauche` : morceaux { texte, ton } ; `actif` : un lancement est en cours.
 * `maintenant` et `ecouleMs` (depuis la réception du message) servent au temps restant.
 */
export function etatBandeau(progression, { paused = false, maintenant = Date.now(), ecouleMs = 0 } = {}) {
  // Pas encore lu : ne pas affirmer qu’aucun lancement n’a eu lieu.
  if (progression === undefined)
    return { actif: false, ton: "", gauche: [{ texte: "Lecture de la file…" }], droite: "" };

  if (!progression) {
    return {
      actif: false,
      ton: paused ? "pause" : "",
      gauche: paused ? [{ texte: "File en pause", ton: "alerte" }] : [{ texte: "Aucun lancement depuis le démarrage" }],
      droite: "",
    };
  }

  const { phase, faits, echecs, annules, enCours, nouvelles, avertissement } = progression;
  const gauche = [];
  const echec = echecs > 0 ? [{ texte: pluriel(echecs, "échec"), ton: "echec" }] : [];
  const alerte = avertissement ? [{ texte: avertissement, ton: "echec" }] : [];

  if (phase === "fini") {
    if (paused) gauche.push({ texte: "File en pause", ton: "alerte" });
    const faitsTexte = progression.etiquettesSeules ? "étiquettes seules" : pluriel(faits, "traité");
    gauche.push({ texte: `${paused ? "dernier" : "Dernier"} lancement : ${faitsTexte}` }, ...echec);
    if (annules > 0) gauche.push({ texte: pluriel(annules, "annulé") });
    gauche.push(...alerte);
    let ton = "fini";
    if (echecs > 0 || avertissement) ton = "echec";
    if (paused) ton = "pause";
    return {
      actif: false,
      ton,
      gauche,
      droite: `terminé à ${heure(progression.fin)} en ${formatDureeMs(progression.dureeMs)}`,
    };
  }

  const resteMs = progression.resteMs == null ? null : Math.max(0, progression.resteMs - ecouleMs);

  if (phase === "etiquettes") {
    return {
      actif: true,
      ton: echecs > 0 ? "echec" : "cours",
      gauche: [{ texte: "Génération des étiquettes" }, ...echec],
      droite: `reste ${formatReste(resteMs)}`,
    };
  }

  if (annules > 0) {
    gauche.push({
      texte: `Annulation : ${pluriel(enCours, "job")} se termine${enCours > 1 ? "nt" : ""}, ${annules} reste${annules > 1 ? "nt" : ""} en attente`,
    });
  } else if (paused) {
    gauche.push({ texte: "En pause", ton: "alerte" });
    if (enCours > 0) gauche.push({ texte: `${pluriel(enCours, "job")} se termine${enCours > 1 ? "nt" : ""}` });
  } else {
    gauche.push({ texte: `${enCours} en cours` });
  }
  gauche.push(...echec);
  if (nouvelles > 0) {
    gauche.push({ texte: nouvelles > 1 ? `${nouvelles} nouvelles tentatives` : "1 nouvelle tentative", ton: "alerte" });
  }

  let droite = "estimation du temps restant…";
  if (paused) droite = "temps restant suspendu";
  else if (resteMs != null) droite = `reste ${formatReste(resteMs)}, fin vers ${heure(maintenant + resteMs)}`;

  let ton = "cours";
  if (echecs > 0) ton = "echec";
  if (paused) ton = "pause";
  return { actif: true, ton, gauche, droite };
}
