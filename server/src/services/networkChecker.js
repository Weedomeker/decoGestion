const fs = require("fs").promises;
const { state } = require("./appState");
const logger = require("../logger/logger");

const KEY_TO_PATH = {
  LM: () => state.paths.decoLM,
  CASTO: () => state.paths.decoCASTO,
  BRICO: () => state.paths.decoBRICO,
  ECOM: () => state.paths.decoECOM,
  PREVIEW: () => state.paths.previewDeco,
};

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
    if (restored.length) logger.info(`Chemins réseau restaurés : ${restored.join(", ")}`);
    Object.assign(state.networkStatus, results);
  }

  return results;
}

module.exports = { checkNetworkPaths };
