const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const logger = require("./logger/logger");

const execFileAsync = promisify(execFile);

// Le JPG ne sert que d'aperçu, ramené ensuite à un A4/A3 de ~1750 px par composeJpgPage.
// À 30 DPI une plaque de 305 cm fait ~3600 px : largement suffisant. L'ancien rendu à 200 DPI
// (pdftopic) produisait ~12000x24000 px et prenait plusieurs minutes par crédence.
const DENSITY = 30;
const CONVERT_TIMEOUT_MS = 5 * 60 * 1000;

const pdfToimg = async (readFile, writeFile) => {
  if (!fs.existsSync(readFile)) {
    throw new Error(`PDF introuvable pour la conversion en image : ${readFile}`);
  }
  await execFileAsync(
    "convert",
    ["-density", String(DENSITY), `pdf:${readFile}[0]`, "-background", "white", "-flatten", "-quality", "90", `jpg:${writeFile}`],
    { timeout: CONVERT_TIMEOUT_MS, windowsHide: true },
  );

  if (!fs.existsSync(writeFile) || fs.statSync(writeFile).size === 0) {
    throw new Error(`Échec de la génération de l'image JPG : ${writeFile}`);
  }
  logger.debug("Image générée");
};

module.exports = async ({ pdf, jpg }) => {
  await pdfToimg(pdf, jpg);
};
