/*
  Dépôt du PDF d'un job dans le hot folder (dernière étape de processJob).
  Jobs Tauro (nomTauro ou horsSession) : dépôt exclusif, jamais deux fois (journal + COPYFILE_EXCL),
  puis inscription au journal LancementTauro. Autres jobs : dépôt comme avant, écrasement permis.
  Teinte masse en session : pas de PDF, inscription seule (inscrireSansPdf).
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

// Garde en mémoire : PDF déposés ou en cours de dépôt par ce processus (`${_id}|${nom}`). Couvre la
// retentative BullMQ quand le journal n'a pas pu être écrit après un dépôt réussi, et le doublon
// (job bloqué relancé) qui arrive pendant la copie. Levée si la copie échoue.
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

  // Retentative BullMQ après un dépôt réussi, ou doublon pendant la copie : le RIP a déjà (ou va)
  // consommer le PDF, ne pas le renvoyer. La clé est réservée AVANT toute attente.
  if (deposes.has(cle)) {
    log.info("PDF déjà déposé (journal), rien n'est recopié");
    return;
  }
  deposes.add(cle);

  try {
    if (await dep(deps, "dejaInscrit")(job)) {
      log.info("PDF déjà déposé (journal), rien n'est recopié");
      return;
    }
  } catch (err) {
    deposes.delete(cle);
    throw err;
  }

  const hotFolder = path.basename(job.writePath);
  if (job.hfTauro && job.hfTauro !== hotFolder) {
    log.warn(`Hot folder ${hotFolder} différent de celui prévu par Tauro (${job.hfTauro})`);
  }

  let octets;
  try {
    ({ size: octets } = await fs.promises.stat(stagedPdfPath));
    // Une UnrecoverableError (fichier déjà présent) remonte telle quelle jusqu'à BullMQ.
    await dep(deps, "deliverToHotFolder")(stagedPdfPath, path.join(job.writePath, nom), { exclusif: true });
  } catch (err) {
    // Copie non faite : une vraie retentative doit pouvoir déposer.
    deposes.delete(cle);
    throw err;
  }
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

/**
 * Teinte masse lancée en session (nomTauro, aucun PDF) : inscrite au journal une fois son JPG fait,
 * comme un PDF déposé. Sans cela, elle repartirait sans blocage « déjà lancé » et son n° d'ordre
 * pourrait être repris par la session suivante du jour. Un échec du journal n'est qu'un avertissement.
 */
async function inscrireSansPdf(job, { log, deps = {} }) {
  if (!job.nomTauro) return;
  try {
    if (await dep(deps, "dejaInscrit")(job)) return;
    await dep(deps, "inscrire")(job, { mode: "session" });
    log.info(`Teinte masse inscrite au journal Tauro : ${job.nomTauro}`);
  } catch (err) {
    log.error("Inscription au journal Tauro impossible :", err);
    dep(deps, "broadcastWS")({ type: "jobWarning", job, reason: `Journal Tauro non enregistré : ${err.message}` });
  }
}

/** Tests uniquement : vide la garde en mémoire. */
function _reinitialiserDepots() {
  deposes.clear();
}

module.exports = { deposerPdf, inscrireSansPdf, estJobTauro, _reinitialiserDepots };
