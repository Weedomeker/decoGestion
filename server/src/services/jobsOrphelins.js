/*
  Jobs BullMQ restés dans Redis après un arrêt du serveur pendant un traitement.
  La file de l'appli (state.jobs) est en mémoire : après un redémarrage, ces jobs n'y sont plus, et le
  worker les traiterait sans que l'opérateur le voie (PDF déposés sans étiquettes ; job en cours repris
  après l'expiration de son verrou, PDF possiblement déposé une 2e fois). Ils sont donc retirés avant
  le démarrage du worker. Un job qui était en cours est signalé : son PDF a pu partir à l'impression.
*/
"use strict";

const ETATS_EN_ATTENTE = ["waiting", "prioritized", "delayed", "paused", "waiting-children"];

// « 011_S1711A_..._4.pdf », ou le n° de commande pour un job hors session ou classique.
function libelle(job) {
  const j = job?.data?.job || {};
  if (j.nomTauro) return `${j.nomTauro}.pdf`;
  const cmd = j.cmd2 > 0 ? `${j.cmd}+${j.cmd2}` : j.cmd;
  return `commande ${cmd ?? "?"}${j.horsSession ? " (hors session)" : ""}`;
}

/**
 * Retire de `queue` les jobs en attente et ceux restés actifs (processus arrêté).
 * Renvoie { attente: [libellés], enCours: [libellés] }. Ne lève jamais : un échec est logué.
 */
async function retirerJobsOrphelins(queue, logger) {
  const bilan = { attente: [], enCours: [] };
  let actifs = [];
  let attente = [];
  try {
    actifs = (await queue.getJobs(["active"])).filter(Boolean);
    attente = (await queue.getJobs(ETATS_EN_ATTENTE)).filter(Boolean);
  } catch (err) {
    logger.error("Contrôle des jobs restés dans Redis impossible :", err);
    return bilan;
  }

  const client = actifs.length ? await queue.client : null;
  for (const job of actifs) {
    try {
      // Le verrou du processus arrêté bloquerait la suppression jusqu'à son expiration.
      await client.del(queue.toKey(`${job.id}:lock`));
      await job.remove();
      bilan.enCours.push(libelle(job));
    } catch (err) {
      logger.error(`Job resté en cours non retiré (${libelle(job)}) :`, err);
    }
  }
  for (const job of attente) {
    try {
      await job.remove();
      bilan.attente.push(libelle(job));
    } catch (err) {
      logger.error(`Job resté en attente non retiré (${libelle(job)}) :`, err);
    }
  }

  if (bilan.enCours.length) {
    logger.warn(
      `Arrêt pendant un traitement : ${bilan.enCours.length} job(s) en cours retiré(s), non relancé(s). ` +
        `Vérifier dans Asanti s'ils sont partis à l'impression avant de les relancer : ${bilan.enCours.join(", ")}`,
    );
  }
  if (bilan.attente.length) {
    logger.warn(
      `Arrêt pendant un traitement : ${bilan.attente.length} job(s) non traité(s) retiré(s), à rajouter dans la file : ${bilan.attente.join(", ")}`,
    );
  }
  return bilan;
}

module.exports = { retirerJobsOrphelins };
