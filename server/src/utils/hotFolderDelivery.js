const fs = require("fs");
const os = require("os");
const path = require("path");

// Le dossier de sortie des PDF (state.paths.tauro → \\192.168.1.72\HotFolderRoot) est le hot folder
// du RIP : un PDF y est consommé (déplacé) quelques secondes après son arrivée. On ne peut donc ni
// le vérifier ni le relire sur place — il est produit dans un dossier local puis déposé en dernier.

function createStagingDir() {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), "decoGestion-pdf-"));
}

// Le RIP pouvant consommer le fichier immédiatement, aucune vérification n'est faite après la
// copie : la promesse résolue suffit à garantir que le fichier a été intégralement écrit.
async function deliverToHotFolder(stagedPdfPath, destPath) {
  const { size } = await fs.promises.stat(stagedPdfPath);
  if (size === 0) throw new Error(`PDF vide, dépôt annulé : ${stagedPdfPath}`);
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await fs.promises.copyFile(stagedPdfPath, destPath);
}

async function removeStagingDir(stagingDir) {
  if (!stagingDir) return;
  await fs.promises.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
}

module.exports = { createStagingDir, deliverToHotFolder, removeStagingDir };
