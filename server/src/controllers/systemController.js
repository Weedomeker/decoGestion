const logger = require("../logger/logger");
const checkVersion = require("../checkVersion");
const { state } = require("../services/appState");
const { getFormatsTauro } = require("../services/formatsService");
const { getDecoPaths } = require("../services/pathService");

async function getProcess(req, res) {
  try {
    const time = new Date().toLocaleTimeString("fr-FR");
    const version = await checkVersion().then((result) => result.message);
    const { jpgTime, pdfTime, jpgName, fileName } = state.process;

    res.status(200).json({
      jpgTime: parseFloat(jpgTime),
      pdfTime: parseFloat(pdfTime),
      jpgPath: jpgName.split("/").slice(2).join("/") + ".jpg",
      fileName,
      time,
      version,
    });
  } catch (error) {
    logger.error(`getProcess: ${error.message}`);
    res.status(500).json({ error: "Erreur de récupération du statut serveur" });
  }
}

async function getPublic(req, res) {
  res.status(501).json({ error: "Non implémenté" });
}

async function getPath(req, res) {
  try {
    res.json(await getDecoPaths());
  } catch (error) {
    logger.error(`getPath: ${error.message}`);
    res.status(500).json({ error: "Erreur de lecture des chemins de visuels" });
  }
}

function getFormatsTauroHandler(req, res) {
  res.json(getFormatsTauro());
}

function getQrCode(req, res) {
  res.status(501).json({ error: "Non implémenté" });
}

module.exports = {
  getProcess,
  getPublic,
  getPath,
  getFormatsTauro: getFormatsTauroHandler,
  getQrCode,
};
