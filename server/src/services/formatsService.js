const path = require("path");
const fs = require("fs");
const { state } = require("./appState");
const logger = require("../logger/logger");

function getFormatsTauro() {
  const filePath = path.join(state.paths.serverRoot, "./formatsTauro.conf");

  try {
    if (fs.existsSync(filePath)) {
      const readFile = fs.readFileSync(filePath, { encoding: "utf8" });
      const lines = readFile.split(/\r?\n/g).filter((line) => line.trim() !== "");
      return lines.map((v, i) => ({ id: i, value: v }));
    }
    fs.writeFileSync(filePath, "");
  } catch (err) {
    logger.error(`getFormatsTauro : impossible de lire/créer formatsTauro.conf : ${err.message}`);
  }
  return [];
}

function saveFormatsTauroIfNeeded(formatTauro = []) {
  const filePath = path.join(state.paths.serverRoot, "./formatsTauro.conf");
  try {
    let arr = [];
    if (fs.existsSync(filePath)) {
      const readFile = fs.readFileSync(filePath, { encoding: "utf8" });
      arr = readFile.split(/\r?\n/g).filter((l) => l.trim() !== "");
    }
    if (formatTauro.length > arr.length) {
      fs.writeFileSync(filePath, formatTauro.join("\n"));
    }
  } catch (err) {
    logger.error(`saveFormatsTauroIfNeeded : impossible d'écrire formatsTauro.conf : ${err.message}`);
  }
}

module.exports = {
  getFormatsTauro,
  saveFormatsTauroIfNeeded,
};
