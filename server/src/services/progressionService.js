/*
  Progression du lancement en cours, diffusée à tous les postes (message WebSocket `progression`).
  Le suivi informe, il ne produit rien : une erreur ici est journalisée et n'atteint jamais le job.
*/
const logger = require("../logger/logger");
const websocketService = require("./websocketService");
const { creerSuivi, HORIZON } = require("../utils/progression");
const { tailleFichier } = require("../utils/espaceDisque");

let suivi = null;
let minuteur = null;

// Un amalgame pèse ses deux PDF sources ; teinte masse et prise en stock n'impriment rien.
function octetsJob(job) {
  if (job.teinteMasse || job.useStock) return 0;
  return tailleFichier(job.visuPath) + (job.visuPath2 ? tailleFichier(job.visuPath2) : 0);
}

function lire() {
  return suivi ? suivi.lire() : null;
}

function diffuser() {
  if (suivi) websocketService.broadcastWS({ type: "progression", progression: suivi.lire() });
}

function arreterMinuteur() {
  clearInterval(minuteur);
  minuteur = null;
}

// Protège la production : aucune exception ne sort d'ici.
const protege =
  (action) =>
  (...args) => {
    try {
      action(...args);
    } catch (error) {
      logger.warn(`Progression non mise à jour : ${error.message}`);
    }
  };

// Transmet au suivi en cours, puis diffuse.
const relayer = (methode) =>
  protege((...args) => {
    if (!suivi) return;
    suivi[methode](...args);
    diffuser();
  });

const demarrer = protege((jobs, { concurrence, etiquettesSeules = false, ordreFige = false } = {}) => {
  arreterMinuteur();
  suivi = null;
  suivi = creerSuivi(jobs, { octets: octetsJob, concurrence, etiquettesSeules, ordreFige });
  minuteur = setInterval(protege(diffuser), HORIZON * 1000);
  minuteur.unref();
  diffuser();
});

const finir = protege((options) => {
  arreterMinuteur();
  if (!suivi) return;
  suivi.finir(options);
  diffuser();
});

module.exports = {
  demarrer,
  debut: relayer("debut"),
  etape: relayer("etape"),
  jpg: relayer("jpg"),
  fait: relayer("fait"),
  tentativeEchouee: relayer("tentativeEchouee"),
  echec: relayer("echec"),
  solder: relayer("solder"),
  annule: relayer("annule"),
  etiquettes: relayer("etiquettes"),
  avertir: relayer("avertir"),
  finir,
  lire,
};
