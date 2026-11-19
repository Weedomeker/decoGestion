const { formatDureeMs } = require("../utils/duree");

// Arrêt propre sur Ctrl+C (SIGINT) ou SIGTERM : les étapes sont fermées dans l'ordre, chacune attendue.
// Le worker BullMQ y laisse finir les jobs en cours, au lieu de couper un PDF en plein traitement.
// Un second signal, ou un arrêt plus long que delaiMs, force la sortie : retirerJobsOrphelins
// signalera au redémarrage les jobs alors interrompus.

const DELAI_ARRET_MS = 10 * 60 * 1000;

function creerArretPropre({ etapes, logger, delaiMs = DELAI_ARRET_MS, exit = (code) => process.exit(code) }) {
  let enCours = false;

  return async function arreter(signal) {
    if (enCours) {
      logger.warn(`${signal} reçu de nouveau : arrêt forcé sans attendre les jobs en cours`);
      exit(1);
      return;
    }
    enCours = true;
    logger.info(`${signal} reçu : arrêt propre (Ctrl+C à nouveau pour forcer)`);

    const minuteur = setTimeout(() => {
      logger.error(`Arrêt propre trop long (plus de ${formatDureeMs(delaiMs)}) : arrêt forcé`);
      exit(1);
    }, delaiMs);

    for (const { nom, fermer } of etapes) {
      try {
        await fermer();
      } catch (err) {
        // Une étape en échec n'empêche pas de fermer les suivantes.
        logger.error(`Arrêt : ${nom} — ${err.message}`);
      }
    }

    clearTimeout(minuteur);
    exit(0);
  };
}

module.exports = { creerArretPropre, DELAI_ARRET_MS };
