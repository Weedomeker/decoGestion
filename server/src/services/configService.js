const path = require("path");
const fs = require("fs");
const logger = require("../logger/logger");
const symlink = require("../symlink");
const { state, updateSourcePath } = require("./appState");

const configPath = path.join("./config.json");

// Lus tels quels depuis config.json : créer un lien symbolique demande des droits Windows qu'un
// poste n'a pas forcément, et le mode sur-mesure resterait alors muet.
const CHEMINS_DIRECTS = { SM: "sourceSM", decoupeSM: "decoupeSM", sortieDevSecours: "sortieDevSecours" };

async function linkFolders(pathUpdate) {
  let config = {};

  if (fs.existsSync(configPath)) {
    const readFile = fs.readFileSync(configPath, "utf8");
    try {
      config = JSON.parse(readFile);
    } catch (error) {
      logger.error("config.json illisible, symlinks non créés :", error);
      return { success: [], failed: [] };
    }
  }

  for (const [cle, chemin] of Object.entries(CHEMINS_DIRECTS)) {
    state.paths[chemin] = typeof config[cle] === "string" ? config[cle].trim() : "";
  }

  const success = [];
  const failed = [];

  for (const key in config) {
    if (key in CHEMINS_DIRECTS) continue;
    // Seuls les chemins (strings) sont des dossiers à lier — `vernis` (tableau) et
    // `jobsConcurrency` (nombre) sont des réglages.
    if (typeof config[key] === "string") {
      const result = await symlink(
        config[key],
        path.join(state.paths.serverRoot, `./public/${key.toUpperCase()}`),
        pathUpdate,
      );
      if (result?.ok) {
        success.push(key);
        updateSourcePath(key);
      } else {
        failed.push({ key, reason: result?.reason });
      }
    }
  }

  if (success.length) logger.info(`Symlinks OK : ${success.map((k) => k.toUpperCase()).join(", ")}`);

  return { success, failed };
}

function getConfig() {
  if (!fs.existsSync(configPath)) return null;
  try {
    const readFile = fs.readFileSync(configPath, "utf8");
    if (!readFile.trim()) return null;
    return JSON.parse(readFile);
  } catch (error) {
    logger.error(`Impossible de lire config.json : ${error.message}`);
    return null;
  }
}

async function saveConfig(nextConfig) {
  let previousConfig = {};

  try {
    if (fs.existsSync(configPath)) {
      previousConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
    // `jobsConcurrency` n'est géré que par saveJobsConcurrency : la modale Config peut renvoyer
    // une valeur périmée (chargée avant un changement depuis la JobsList).
    const merged = { ...nextConfig };
    delete merged.jobsConcurrency;
    if (previousConfig.jobsConcurrency !== undefined) merged.jobsConcurrency = previousConfig.jobsConcurrency;
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
  } catch (error) {
    throw new Error(`Impossible d'écrire config.json: ${error.message}`);
  }

  const linkResult = await linkFolders(true);
  return { previousConfig, linkResult };
}

// Persiste la concurrence des jobs sans relancer les symlinks (réglage, pas un chemin).
function saveJobsConcurrency(concurrency) {
  const config = getConfig() || {};
  config.jobsConcurrency = concurrency;
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    throw new Error(`Impossible d'écrire config.json: ${error.message}`);
  }
}

module.exports = {
  linkFolders,
  getConfig,
  saveConfig,
  saveJobsConcurrency,
};
