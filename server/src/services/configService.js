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
      return logger.error(error);
    }
  }

  for (const key in config) {
    if (key !== "vernis") {
      await symlink(config[key], path.join(state.paths.serverRoot, `./public/${key.toUpperCase()}`), pathUpdate);
    }
    updateSourcePath(key);
  }
}

function getConfig() {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  const readFile = fs.readFileSync(configPath, "utf8");
  if (Object.keys(readFile).length === 0) {
    return undefined;
  }

  return JSON.parse(readFile);
}

async function saveConfig(nextConfig) {
  let previousConfig = {};

  if (fs.existsSync(configPath)) {
    const readFile = fs.readFileSync(configPath, "utf8");
    previousConfig = JSON.parse(readFile);
  }

  fs.writeFileSync(configPath, JSON.stringify(nextConfig));
  await linkFolders(true);

  return previousConfig;
}

module.exports = {
  linkFolders,
  getConfig,
  saveConfig,
};
