/*
  Dépôt du PDF d'un job dans le hot folder (dernière étape de processJob).
  Jobs Tauro (nomTauro ou horsSession) : dépôt exclusif, jamais deux fois (journal + COPYFILE_EXCL),
  puis inscription au journal LancementTauro. Autres jobs : dépôt comme avant, écrasement permis.
*/
"use strict";
const fs = require("fs");
const path = require("path");

function depsParDefaut() {
  const { deliverToHotFolder } = require("../utils/hotFolderDelivery");
  const { dejaInscrit, inscrire } = require("./journalTauro");
  const { broadcastWS } = require("../services/websocketService");
  return { deliverToHotFolder, dejaInscrit, inscrire, broadcastWS };
}

const estJobTauro = (job) => !!(job.nomTauro || job.horsSession);

/**
 * Dépose `stagedPdfPath` dans `job.writePath`.
 * Lève l'UnrecoverableError du dépôt exclusif telle quelle (BullMQ ne retente pas) ;
 * un échec du journal après un dépôt réussi n'est qu'un avertissement.
 */
async function deposerPdf(job, { stagedPdfPath, pdfBaseName, log, deps = {} }) {
  const d = { ...depsParDefaut(), ...deps };

  if (!estJobTauro(job)) {
    await d.deliverToHotFolder(stagedPdfPath, path.join(job.writePath, pdfBaseName));
    log.info(`PDF déposé dans le hot folder : ${pdfBaseName}`);
    return;
  }

  // Retentative BullMQ après un dépôt réussi : le RIP a déjà consommé le PDF, ne pas le renvoyer.
  if (await d.dejaInscrit(job)) {
    log.info("PDF déjà déposé (journal), rien n'est recopié");
    return;
  }

  const nom = job.nomTauro ? `${job.nomTauro}.pdf` : pdfBaseName;
  const hotFolder = path.basename(job.writePath);
  if (job.hfTauro && job.hfTauro !== hotFolder) {
    log.warn(`Hot folder ${hotFolder} différent de celui prévu par Tauro (${job.hfTauro})`);
  }

  const { size: octets } = await fs.promises.stat(stagedPdfPath);
  // Une UnrecoverableError (fichier déjà présent) remonte telle quelle jusqu'à BullMQ.
  await d.deliverToHotFolder(stagedPdfPath, path.join(job.writePath, nom), { exclusif: true });
  log.info(`PDF déposé dans le hot folder : ${nom}`);

  try {
    await d.inscrire(job, { source: job.visuPath, octets, mode: job.horsSession ? "hors-session" : "session" });
  } catch (err) {
    log.error("Inscription au journal Tauro impossible :", err);
    d.broadcastWS({ type: "jobWarning", job, reason: `Journal Tauro non enregistré : ${err.message}` });
  }
}

module.exports = { deposerPdf, estJobTauro };
