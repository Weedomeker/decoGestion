const fs = require("fs").promises;
const os = require("os");
const path = require("path");
const { state } = require("./appState");
const logger = require("../logger/logger");

const KEY_TO_PATH = {
  LM: () => state.paths.decoLM,
  CASTO: () => state.paths.decoCASTO,
  BRICO: () => state.paths.decoBRICO,
  ECOM: () => state.paths.decoECOM,
  PREVIEW: () => state.paths.previewDeco,
  SM: () => state.paths.sourceSM,
  DECOUPESM: () => state.paths.decoupeSM,
  // Dossier où les PDF sont déposés : le hot folder Tauro en prod, un dossier local en dev.
  TAURO: () => state.paths.saveFolder,
};

// Espace libre là où les PDF sont écrits (sortie) et produits (temporaire), affiché dans le pied de page.
// Asynchrone : un partage injoignable ne bloque pas le serveur, il donne seulement `null`.
async function mesurerDisque(dossier) {
  if (!dossier) return null;
  try {
    const { bavail, bsize } = await fs.statfs(dossier);
    // realpath : en prod `public/TAURO` est un lien, on affiche le partage réellement mesuré.
    const reel = await fs.realpath(dossier).catch(() => path.resolve(dossier));
    return { dossier: reel, libre: bavail * bsize };
  } catch {
    return null;
  }
}

async function mesurerDisques() {
  const [sortie, temp] = await Promise.all([mesurerDisque(state.paths.saveFolder), mesurerDisque(os.tmpdir())]);
  state.disque = { sortie, temp };
  return state.disque;
}

// Au tout premier contrôle (démarrage), tous les chemins partent de "false" dans state.networkStatus :
// on logue "OK" plutôt que "restaurés", qui laisserait croire à une coupure préalable.
let firstCheck = true;

async function checkNetworkPaths() {
  const results = {};
  for (const [key, getPath] of Object.entries(KEY_TO_PATH)) {
    const p = getPath();
    if (!p) {
      results[key] = false;
      continue;
    }
    try {
      await fs.access(p, fs.constants.R_OK);
      results[key] = true;
    } catch (err) {
      logger.warn(`Chemin réseau inaccessible [${key}] : ${err.code || err.message}`);
      results[key] = false;
    }
  }

  const changed = Object.keys(results).some((k) => state.networkStatus[k] !== results[k]);
  if (changed) {
    const lost = Object.keys(results).filter((k) => !results[k] && state.networkStatus[k]);
    const restored = Object.keys(results).filter((k) => results[k] && !state.networkStatus[k]);
    if (lost.length) logger.warn(`Chemins réseau inaccessibles : ${lost.join(", ")}`);
    if (restored.length) logger.info(`Chemins réseau ${firstCheck ? "OK" : "restaurés"} : ${restored.join(", ")}`);
    // Depuis quand chaque chemin est dans son état actuel, pour « injoignable depuis 14:32 ».
    const maintenant = new Date().toISOString();
    Object.keys(results)
      .filter((k) => state.networkStatus[k] !== results[k])
      .forEach((k) => {
        state.networkDepuis[k] = maintenant;
      });
    Object.assign(state.networkStatus, results);
  }
  firstCheck = false;

  await mesurerDisques();
  return results;
}

module.exports = { checkNetworkPaths, mesurerDisques };
