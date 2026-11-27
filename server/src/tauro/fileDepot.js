/*
  File de dépôt d'un lancement Tauro en session : les PDF arrivent dans le hot folder dans l'ordre
  d'impression (ordreTauro). Asanti numérote ses jobs dans leur ordre d'arrivée, et « Select all » →
  « Add to Queue » sur la Tauro suit ce numéro, pas le tri par nom affiché : un petit PDF fini avant
  un gros passait devant lui dans la Queue.

  Chaque job copie son PDF dans un dossier d'attente (`attenteTauro` de config.json, dossier de la
  session du jour) puis se termine : sa place de travail est libérée. Un dépositeur unique envoie
  ensuite les PDF un par un, dans l'ordre. Un job en échec puis relancé garde sa place (les suivants
  l'attendent) ; un job en échec définitif, annulé ou sorti sans PDF est sauté.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const { UnrecoverableError } = require("bullmq");

const DELAIS_ESSAIS_MS = [2000, 5000];

const attendreMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nomDe = (job) => (job?.nomTauro ? `${job.nomTauro}.pdf` : String(job?._id ?? "?"));

/**
 * Dossier d'attente du lancement : `<attenteTauro>/<PRINTSA#…>`, ou `<attenteTauro>/dev/<PRINTSA#…>`
 * en dev (base Test : ses noms Tauro peuvent être ceux de la production). Vide = fonction désactivée.
 */
function dossierAttente(paths, { env = process.env.NODE_ENV } = {}) {
  const racine = typeof paths?.attenteTauro === "string" ? paths.attenteTauro.trim() : "";
  if (!racine) return "";
  return env === "development"
    ? path.join(racine, "dev", paths.sessionPRINTSA)
    : path.join(racine, paths.sessionPRINTSA);
}

/**
 * `jobs` : jobs de session avec PDF. `deposer(job, cheminAttente)` envoie un PDF dans le hot folder.
 * États d'une entrée : attente → pret → depose, ou ecarte (sauté), ou bloque (dépôt impossible).
 */
function creerFileDepot(
  jobs,
  { deposer, log, broadcastWS = () => {}, delaisMs = DELAIS_ESSAIS_MS, attendre = attendreMs } = {},
) {
  const entrees = [...jobs]
    .sort((a, b) => a.ordreTauro - b.ordreTauro)
    .map((job) => ({ id: String(job._id), job, etat: "attente", chemin: null }));
  const parId = new Map(entrees.map((e) => [e.id, e]));
  let tete = 0;
  let arrete = false;
  let pompe = null;
  let attentesFin = [];

  const fini = () => !pompe && (arrete || tete >= entrees.length);

  function verifierFin() {
    if (!fini()) return;
    attentesFin.forEach((resolve) => resolve());
    attentesFin = [];
  }

  // Renvoie "depose", "saute" (déjà présent dans le hot folder) ou "bloque".
  async function deposerAvecEssais(e) {
    for (let essai = 0; ; essai++) {
      try {
        await deposer(e.job, e.chemin);
        return "depose";
      } catch (err) {
        if (err instanceof UnrecoverableError) {
          log.error(`${nomDe(e.job)} non déposé : ${err.message}`);
          broadcastWS({ type: "jobError", job: e.job, reason: err.message });
          return "saute";
        }
        if (essai >= delaisMs.length) {
          const restes = entrees.slice(tete).map((x) => nomDe(x.job));
          const raison = `Dépôt impossible de ${nomDe(e.job)} : ${err.message}. PDF restés en attente (${restes.length}), à déposer dans l'ordre des noms : ${restes.join(", ")}`;
          log.error(raison);
          broadcastWS({ type: "jobError", job: e.job, reason: raison });
          return "bloque";
        }
        log.warn(`Dépôt de ${nomDe(e.job)} échoué, nouvel essai : ${err.message}`);
        await attendre(delaisMs[essai]);
      }
    }
  }

  function pomper() {
    if (pompe || arrete) return;
    pompe = (async () => {
      while (tete < entrees.length && !arrete) {
        const e = entrees[tete];
        if (e.etat === "ecarte") {
          tete++;
          continue;
        }
        if (e.etat !== "pret") break;
        const issue = await deposerAvecEssais(e);
        if (issue === "bloque") {
          e.etat = "bloque";
          arrete = true;
          break;
        }
        e.etat = issue === "depose" ? "depose" : "ecarte";
        tete++;
      }
    })().finally(() => {
      pompe = null;
      // Un job a pu devenir prêt pendant le dernier dépôt, après le test de la boucle.
      const suivant = entrees[tete];
      if (!arrete && suivant && (suivant.etat === "pret" || suivant.etat === "ecarte")) pomper();
      else verifierFin();
    });
  }

  return {
    attend: (id) => parId.has(String(id)),

    /** État du job dans la file : attente, pret, depose, ecarte, bloque (undefined hors file). */
    etat: (id) => parId.get(String(id))?.etat,

    /** PDF du job copié dans l'attente. Faux si le job est déjà déposé ou écarté (doublon). */
    pret(id, chemin) {
      const e = parId.get(String(id));
      if (!e || (e.etat !== "attente" && e.etat !== "pret")) return false;
      e.etat = "pret";
      e.chemin = chemin;
      pomper();
      return true;
    },

    /** Fin du job BullMQ, quelle qu'en soit l'issue : écarté s'il n'a jamais été prêt. */
    solder(id) {
      const e = parId.get(String(id));
      if (!e || e.etat !== "attente") return;
      e.etat = "ecarte";
      log.warn(`${nomDe(e.job)} sans PDF en attente : son n° est sauté`);
      pomper();
      verifierFin();
    },

    /** Résolue quand tout est déposé ou écarté, ou que la file s'est arrêtée sur un dépôt impossible. */
    vider() {
      pomper();
      if (fini()) return Promise.resolve();
      return new Promise((resolve) => attentesFin.push(resolve));
    },

    bilan() {
      const noms = (filtre) => entrees.filter(filtre).map((e) => nomDe(e.job));
      return {
        deposes: noms((e) => e.etat === "depose"),
        ecartes: noms((e) => e.etat === "ecarte"),
        restes: noms((e) => e.etat === "pret" || e.etat === "bloque"),
      };
    },
  };
}

// File du lancement en cours (un seul lancement à la fois : queueControl.reserver).
let courante = null;
const definir = (file) => {
  courante = file;
};
const effacer = () => {
  courante = null;
};

/**
 * Démarrage : supprime le PDF d'attente des jobs de session retirés de Redis (jamais déposés, à relancer),
 * puis liste ceux qui restent dans l'attente du jour (arrêt pendant les dépôts), sans les supprimer.
 */
async function nettoyerAttente(fichiersOrphelins, dossierDuJour, { fsp = fs.promises } = {}) {
  const supprimes = [];
  for (const chemin of fichiersOrphelins) {
    try {
      await fsp.unlink(chemin);
      supprimes.push(path.basename(chemin));
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  let restants = [];
  if (dossierDuJour) {
    try {
      restants = (await fsp.readdir(dossierDuJour)).filter((nom) => /\.pdf$/i.test(nom)).sort();
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  return { supprimes, restants };
}

module.exports = {
  creerFileDepot,
  dossierAttente,
  nettoyerAttente,
  definir,
  effacer,
  courante: () => courante,
};
