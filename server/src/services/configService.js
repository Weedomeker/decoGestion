const path = require("path");
const fs = require("fs");
const logger = require("../logger/logger");
const symlink = require("../symlink");
const { state, updateSourcePath } = require("./appState");

const configPath = path.join("./config.json");

async function linkFolders(pathUpdate) {
  let config = {};

  if (fs.existsSync(configPath)) {
    const readFile = fs.readFileSync(configPath, "utf8");
    try {
      config = JSON.parse(readFile);
    } catch (error) {
      logger.error(error);
      return { success: [], failed: [] };
    }
  }

  const success = [];
  const failed = [];

  for (const key in config) {
    if (key !== "vernis") {
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
    fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2));
  } catch (error) {
    throw new Error(`Impossible d'écrire config.json: ${error.message}`);
  }

  const linkResult = await linkFolders(true);
  return { previousConfig, linkResult };
}

module.exports = {
  linkFolders,
  getConfig,
  saveConfig,
};
