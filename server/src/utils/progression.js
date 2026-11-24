/*
  Progression d'un lancement de la File : chaque job pèse sa durée probable, ses étapes le font avancer,
  et le temps fait progresser la barre dans une étape sans jamais la dépasser. Aucune dépendance : horloge
  (ms) et taille des fichiers sont injectées.
*/
const MO = 2 ** 20;
const ETAPES = ["pdf", "jpg", "depot", "base"];

// Durées attendues (s), mesurées sur 86 jobs de production (novembre 2026). Elles fixent le poids relatif
// des jobs ; l'échelle réelle est recalée pendant le lancement.
const PDF = { base: 10, parMo: 0.75 };
const JPG = 10;
const DEPOT = { base: 3, parMo: 0.12 };
const BASE = 25;
const ETIQUETTES = { base: 2, parJob: 0.3 };

// Avance maximale d'une étape qui n'est pas finie, et seuil à partir duquel elle ralentit.
const PLAFOND_ETAPE = 0.98;
const SEUIL_LENT = 0.9;

// Recalage réel / attendu : poids de l'a priori (s) et bornes.
const A_PRIORI = 60;
const RECALAGE_MIN = 0.05;
const RECALAGE_MAX = 5;

// Horizon (s) sur lequel la vitesse est mesurée, égal à l'intervalle de diffusion.
const HORIZON = 5;

const ETATS_FINAUX = ["fait", "echec", "annule"];

const somme = (valeurs) => valeurs.reduce((total, v) => total + v, 0);

function dureesAttendues(job, octets) {
  const mo = (octets || 0) / MO;
  if (job.teinteMasse || job.useStock) return { jpg: JPG, base: BASE };
  return { pdf: PDF.base + PDF.parMo * mo, jpg: JPG, depot: DEPOT.base + DEPOT.parMo * mo, base: BASE };
}

// Part faite (0 à 0,98) d'une étape commencée depuis `ecoule` s, pour `attendu` s.
function avanceEtape(ecoule, attendu) {
  const x = Math.max(0, ecoule) / attendu;
  if (x <= SEUIL_LENT) return x;
  return SEUIL_LENT + (PLAFOND_ETAPE - SEUIL_LENT) * (1 - Math.exp(-(x - SEUIL_LENT) / 0.5));
}

/**
 * Suivi d'un lancement. `jobs` dans l'ordre de lancement ; `octets(job)` : poids du ou des PDF sources ;
 * `concurrence()` : nombre de jobs traités à la fois.
 */
function creerSuivi(
  jobs,
  { horloge = Date.now, octets = () => 0, concurrence = () => 1, etiquettesSeules = false, ordreFige = false } = {},
) {
  const debutLancement = horloge();
  const lignes = jobs.map((job) => {
    const taille = octets(job);
    const durees = dureesAttendues(job, taille);
    return {
      id: String(job._id),
      cmd: job.cmd,
      nom: job.nomTauro || null,
      mo: Math.round((taille / MO) * 10) / 10,
      durees,
      poids: somme(Object.values(durees)),
      etat: "attente",
      etape: null,
      debutEtape: 0,
      reels: {},
      tentative: 0,
      raison: null,
      jpg: null,
      avMax: 0,
    };
  });
  const parId = new Map(lignes.map((ligne) => [ligne.id, ligne]));
  const poidsEtiquettes = ETIQUETTES.base + ETIQUETTES.parJob * lignes.length;

  let phase = etiquettesSeules ? "etiquettes" : "jobs";
  let debutEtiquettes = etiquettesSeules ? debutLancement : 0;
  let fin = null;
  let avertissement = null;
  let pctMax = 0;
  const recalage = { reel: 0, attendu: 0, etapes: 0 };

  const ouverte = (id) => {
    const ligne = parId.get(String(id));
    return ligne && !ETATS_FINAUX.includes(ligne.etat) && phase !== "fini" ? ligne : null;
  };

  const facteur = () => {
    const k = (recalage.reel + A_PRIORI) / (recalage.attendu + A_PRIORI);
    return Math.min(RECALAGE_MAX, Math.max(RECALAGE_MIN, k));
  };

  function cloreEtape(ligne) {
    if (!ligne.etape) return;
    const reel = (horloge() - ligne.debutEtape) / 1000;
    ligne.reels[ligne.etape] = reel;
    recalage.reel += reel;
    recalage.attendu += ligne.durees[ligne.etape] || 0;
    recalage.etapes += 1;
    ligne.etape = null;
  }

  // Part faite d'un job à l'instant t ; `plafond` : comme si l'étape en cours était à son maximum.
  function avance(ligne, t, plafond = false) {
    if (ligne.etat === "fait" || ligne.etat === "echec") return 1;
    if (ligne.etat === "annule") return 0;
    let faite = 0;
    for (const etape of ETAPES) {
      const attendu = ligne.durees[etape];
      if (!attendu) continue;
      if (etape in ligne.reels) faite += attendu;
      else if (etape === ligne.etape) {
        const part = plafond ? PLAFOND_ETAPE : avanceEtape((t - ligne.debutEtape) / 1000, attendu * facteur());
        faite += attendu * part;
      }
    }
    return Math.max(ligne.avMax, faite / ligne.poids);
  }

  // Pourcentage à l'instant t, sans la mémoire de pctMax.
  function pourcentage(t, plafond = false) {
    if (phase === "fini") return 100;
    const comptees = etiquettesSeules ? [] : lignes.filter((ligne) => ligne.etat !== "annule");
    const total = somme(comptees.map((ligne) => ligne.poids)) + poidsEtiquettes;
    let fait = somme(comptees.map((ligne) => ligne.poids * avance(ligne, t, plafond)));
    if (phase === "etiquettes") {
      fait += poidsEtiquettes * (plafond ? PLAFOND_ETAPE : avanceEtape((t - debutEtiquettes) / 1000, poidsEtiquettes));
    }
    return (fait / total) * 100;
  }

  // Jobs restants répartis sur les places, dans l'ordre de lancement (ceux en cours d'abord), puis étiquettes.
  function reste(t) {
    if (phase === "fini") return 0;
    if (phase === "etiquettes") return Math.max(0, poidsEtiquettes - (t - debutEtiquettes) / 1000) * 1000;
    if (recalage.etapes === 0) return null;
    const k = facteur();
    const aFaire = lignes.filter((ligne) => !ETATS_FINAUX.includes(ligne.etat));
    const ordre = [
      ...aFaire.filter((ligne) => ligne.etat === "cours"),
      ...aFaire.filter((ligne) => ligne.etat !== "cours"),
    ];
    const places = new Array(Math.max(1, concurrence())).fill(0);
    ordre.forEach((ligne) => {
      const i = places.indexOf(Math.min(...places));
      places[i] += (1 - avance(ligne, t)) * ligne.poids * k;
    });
    return Math.round((Math.max(...places) + poidsEtiquettes) * 1000);
  }

  const compter = (etat) => lignes.filter((ligne) => ligne.etat === etat).length;

  return {
    // Début d'une tentative : la première, ou une reprise par BullMQ.
    debut(id) {
      const ligne = ouverte(id);
      if (!ligne) return;
      ligne.avMax = avance(ligne, horloge());
      ligne.tentative += 1;
      ligne.etat = "cours";
      ligne.etape = null;
      ligne.reels = {};
    },

    etape(id, nom) {
      const ligne = ouverte(id);
      if (!ligne || !ligne.durees[nom]) return;
      ligne.avMax = avance(ligne, horloge());
      cloreEtape(ligne);
      ligne.etat = "cours";
      ligne.etape = nom;
      ligne.debutEtape = horloge();
    },

    jpg(id, chemin) {
      const ligne = ouverte(id);
      if (ligne) ligne.jpg = chemin;
    },

    fait(id) {
      const ligne = ouverte(id);
      if (!ligne) return;
      cloreEtape(ligne);
      ligne.etat = "fait";
      ligne.raison = null;
    },

    // BullMQ va peut-être retenter : l'échec n'est définitif qu'avec echec().
    tentativeEchouee(id, raison) {
      const ligne = ouverte(id);
      if (!ligne) return;
      ligne.avMax = avance(ligne, horloge());
      ligne.etat = "nouvelle";
      ligne.etape = null;
      ligne.raison = String(raison || "").replace(/^Job \S+ : /, "") || null;
    },

    echec(id, raison) {
      const ligne = ouverte(id);
      if (!ligne) return;
      ligne.etat = "echec";
      ligne.etape = null;
      ligne.raison = ligne.raison || String(raison || "").replace(/^Job \S+ : /, "") || "Échec";
    },

    // Fin côté BullMQ : un job sans fait() ni echec() n'a rien produit.
    solder(id) {
      const ligne = ouverte(id);
      if (!ligne) return;
      ligne.etat = "echec";
      ligne.etape = null;
      ligne.raison = ligne.raison || "Non traité";
    },

    annule(id) {
      const ligne = ouverte(id);
      if (!ligne) return;
      ligne.etat = "annule";
      ligne.etape = null;
    },

    etiquettes() {
      if (phase !== "jobs") return;
      phase = "etiquettes";
      debutEtiquettes = horloge();
    },

    avertir(message) {
      avertissement = message;
    },

    finir({ erreur } = {}) {
      if (phase === "fini") return;
      if (erreur) avertissement = erreur;
      const etatFinal = etiquettesSeules && !erreur ? "fait" : "annule";
      lignes.forEach((ligne) => {
        if (ETATS_FINAUX.includes(ligne.etat)) return;
        ligne.etat = etatFinal;
        ligne.etape = null;
      });
      phase = "fini";
      fin = horloge();
    },

    lire() {
      const t = horloge();
      const brut = pourcentage(t);
      pctMax = phase === "fini" ? 100 : Math.max(pctMax, brut);
      const plafond = Math.max(pctMax, pourcentage(t, true));
      const vitesse = phase === "fini" ? 0 : Math.max(0, (pourcentage(t + HORIZON * 1000) - brut) / HORIZON);
      return {
        phase,
        etiquettesSeules,
        ordreFige,
        total: lignes.length,
        faits: compter("fait"),
        echecs: compter("echec"),
        annules: compter("annule"),
        enCours: compter("cours"),
        nouvelles: compter("nouvelle"),
        pct: pctMax,
        vitesse,
        plafond,
        resteMs: reste(t),
        debut: debutLancement,
        fin,
        dureeMs: fin === null ? null : fin - debutLancement,
        avertissement,
        poidsEtiquettes,
        jobs: lignes.map((ligne) => {
          const av = avance(ligne, t);
          if (ligne.etape) ligne.avMax = av;
          return {
            id: ligne.id,
            cmd: ligne.cmd,
            nom: ligne.nom,
            mo: ligne.mo,
            poids: ligne.poids,
            etat: ligne.etat,
            etape: ligne.etape,
            etapes: Object.keys(ligne.durees),
            avEtape: ligne.etape
              ? avanceEtape((t - ligne.debutEtape) / 1000, ligne.durees[ligne.etape] * facteur())
              : 0,
            reels: { ...ligne.reels },
            tentative: ligne.tentative,
            raison: ligne.raison,
            jpg: ligne.jpg,
            av,
            vitesse: ligne.etape ? Math.max(0, (avance(ligne, t + HORIZON * 1000) - av) / HORIZON) : 0,
            plafond: Math.max(av, avance(ligne, t, true)),
            resteMs: ligne.etat === "cours" ? Math.round((1 - av) * ligne.poids * facteur() * 1000) : null,
          };
        }),
      };
    },
  };
}

module.exports = { dureesAttendues, avanceEtape, creerSuivi, ETAPES, HORIZON };
