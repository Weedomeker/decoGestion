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

// `rotate` (degrés, sens horaire) s'applique après le rendu, qui respecte déjà le /Rotate du PDF.
const pdfToimg = async (readFile, writeFile, rotate = 0) => {
  if (!fs.existsSync(readFile)) {
    throw new Error(`PDF introuvable pour la conversion en image : ${readFile}`);
  }
  const rotateArgs = rotate ? ["-rotate", String(rotate)] : [];
  await execFileAsync(
    "convert",
    ["-density", String(DENSITY), `pdf:${readFile}[0]`, "-background", "white", "-flatten", ...rotateArgs, "-quality", "90", `jpg:${writeFile}`],
    { timeout: CONVERT_TIMEOUT_MS, windowsHide: true },
  );

  if (!fs.existsSync(writeFile) || fs.statSync(writeFile).size === 0) {
    throw new Error(`Échec de la génération de l'image JPG : ${writeFile}`);
  }
  logger.debug("Image générée");
};

module.exports = async ({ pdf, jpg, rotate }) => {
  await pdfToimg(pdf, jpg, rotate);
};
