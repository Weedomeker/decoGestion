const path = require("path");
const logger = require("../logger/logger");
const checkVersion = require("../checkVersion");
const { readChangelog } = require("../services/changelogService");
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
      jpgPath: `${jpgName.split("/").slice(2).join("/")  }.jpg`,
      fileName,
      time,
      version,
    });
  } catch (error) {
    logger.error(`getProcess: ${error.message}`);
    res.status(500).json({ error: "Erreur de récupération du statut serveur" });
  }
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

async function getVersion(req, res) {
  try {
    const { latest, updateAvailable } = await checkVersion();
    const { version, commit, buildDate } = state.app;
    res.json({ version, commit, buildDate, latest, updateAvailable });
  } catch (error) {
    logger.error(`getVersion: ${error.message}`);
    res.status(500).json({ error: "Erreur de lecture de la version" });
  }
}

function getChangelog(req, res) {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 5, 1), 50);
  res.json(
    readChangelog({
      since: req.query.since,
      limit,
      current: state.app.version,
      filePath: path.join(state.paths.projectRoot, "CHANGELOG.md"),
    }),
  );
}

module.exports = {
  getProcess,
  getPath,
  getFormatsTauro: getFormatsTauroHandler,
  getVersion,
  getChangelog,
};
