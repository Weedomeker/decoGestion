const checkVersion = require("../checkVersion");
const { state } = require("../services/appState");
const { getFormatsTauro } = require("../services/formatsService");
const { getDecoPaths } = require("../services/pathService");

async function getProcess(req, res) {
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
}

async function getPublic(req, res) {
  res.status(200).send();
}

async function getPath(req, res) {
  res.json(await getDecoPaths());
}

function getFormatsTauroHandler(req, res) {
  res.json(getFormatsTauro());
}

function getQrCode(req, res) {
  res.status(200).send();
}

module.exports = {
  getProcess,
  getPublic,
  getPath,
  getFormatsTauro: getFormatsTauroHandler,
  getQrCode,
};
