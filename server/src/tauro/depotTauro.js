/*
  Dépôt du PDF d'un job dans le hot folder (dernière étape de processJob).
  Jobs Tauro (nomTauro ou horsSession) : dépôt exclusif, jamais deux fois (journal + COPYFILE_EXCL),
  puis inscription au journal LancementTauro. Autres jobs : dépôt comme avant, écrasement permis.
*/
"use strict";
const fs = require("fs");
const path = require("path");

// Dépendances réelles chargées à la demande : un job classique ne charge ni le journal (Mongo)
// ni le WebSocket, seulement le dépôt.
const CHARGEURS = {
  deliverToHotFolder: () => require("../utils/hotFolderDelivery").deliverToHotFolder,
  dejaInscrit: () => require("./journalTauro").dejaInscrit,
  inscrire: () => require("./journalTauro").inscrire,
  broadcastWS: () => require("../services/websocketService").broadcastWS,
};
const dep = (deps, nom) => deps[nom] || CHARGEURS[nom]();

// Garde en mémoire : PDF déjà déposés par ce processus (`${_id}|${nom}`). Couvre la retentative
// BullMQ quand le journal n'a pas pu être écrit après un dépôt réussi.
const deposes = new Set();

const estJobTauro = (job) => !!(job.nomTauro || job.horsSession);

/**
 * Dépose `stagedPdfPath` dans `job.writePath`.
 * Lève l'UnrecoverableError du dépôt exclusif telle quelle (BullMQ ne retente pas) ;
 * un échec du journal après un dépôt réussi n'est qu'un avertissement.
 */
async function deposerPdf(job, { stagedPdfPath, pdfBaseName, log, deps = {} }) {
  if (!estJobTauro(job)) {
    await dep(deps, "deliverToHotFolder")(stagedPdfPath, path.join(job.writePath, pdfBaseName));
    log.info(`PDF déposé dans le hot folder : ${pdfBaseName}`);
    return;
  }

  const nom = job.nomTauro ? `${job.nomTauro}.pdf` : pdfBaseName;
  const cle = `${job._id}|${nom}`;

  // Retentative BullMQ après un dépôt réussi : le RIP a déjà consommé le PDF, ne pas le renvoyer.
  if (deposes.has(cle) || (await dep(deps, "dejaInscrit")(job))) {
    log.info("PDF déjà déposé (journal), rien n'est recopié");
    return;
  }

  const hotFolder = path.basename(job.writePath);
  if (job.hfTauro && job.hfTauro !== hotFolder) {
    log.warn(`Hot folder ${hotFolder} différent de celui prévu par Tauro (${job.hfTauro})`);
  }

  const { size: octets } = await fs.promises.stat(stagedPdfPath);
  // Une UnrecoverableError (fichier déjà présent) remonte telle quelle jusqu'à BullMQ.
  await dep(deps, "deliverToHotFolder")(stagedPdfPath, path.join(job.writePath, nom), { exclusif: true });
  deposes.add(cle);
  log.info(`PDF déposé dans le hot folder : ${nom}`);

  try {
    await dep(deps, "inscrire")(job, {
      source: job.visuPath,
      octets,
      mode: job.horsSession ? "hors-session" : "session",
    });
  } catch (err) {
    log.error("Inscription au journal Tauro impossible :", err);
    dep(deps, "broadcastWS")({ type: "jobWarning", job, reason: `Journal Tauro non enregistré : ${err.message}` });
  }
}

/** Tests uniquement : vide la garde en mémoire. */
function _reinitialiserDepots() {
  deposes.clear();
}

module.exports = { deposerPdf, estJobTauro, _reinitialiserDepots };
