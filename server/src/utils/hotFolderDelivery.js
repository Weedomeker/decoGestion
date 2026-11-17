const fs = require("fs");
const os = require("os");
const path = require("path");
const { UnrecoverableError } = require("bullmq");

// Le dossier de sortie des PDF (state.paths.tauro → \\192.168.1.72\HotFolderRoot) est le hot folder
// du RIP : un PDF y est consommé (déplacé) quelques secondes après son arrivée. On ne peut donc ni
// le vérifier ni le relire sur place — il est produit dans un dossier local puis déposé en dernier.

async function createStagingDir(racine = os.tmpdir()) {
  await fs.promises.mkdir(racine, { recursive: true });
  return fs.promises.mkdtemp(path.join(racine, "decoGestion-pdf-"));
}

// Le RIP pouvant consommer le fichier immédiatement, aucune vérification n'est faite après la
// copie : la promesse résolue suffit à garantir que le fichier a été intégralement écrit.
// `exclusif` (jobs Tauro) : un fichier du même nom déjà présent n'est jamais écrasé. L'erreur est
// irrécupérable pour que BullMQ ne retente pas : le PDF partirait une 2e fois à l'impression.
async function deliverToHotFolder(stagedPdfPath, destPath, { exclusif = false } = {}) {
  const { size } = await fs.promises.stat(stagedPdfPath);
  if (size === 0) throw new Error(`PDF vide, dépôt annulé : ${stagedPdfPath}`);
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  if (!exclusif) {
    await fs.promises.copyFile(stagedPdfPath, destPath);
    return;
  }
  try {
    await fs.promises.copyFile(stagedPdfPath, destPath, fs.constants.COPYFILE_EXCL);
  } catch (err) {
    if (err.code === "EEXIST") {
      throw new UnrecoverableError(`Déjà présent dans ${path.dirname(destPath)} : ${path.basename(destPath)}`);
    }
    throw err;
  }
}

async function removeStagingDir(stagingDir) {
  if (!stagingDir) return;
  await fs.promises.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
}

module.exports = { createStagingDir, deliverToHotFolder, removeStagingDir };
