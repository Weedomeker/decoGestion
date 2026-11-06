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

const pixels = (mm) => Math.round((mm / 25.4) * DENSITY);

// `rotate` (degrés, sens horaire) s'applique après le rendu, qui respecte déjà le /Rotate du PDF.
// `zone` (mm, origine en haut à gauche) recadre le rendu avant la rotation.
// `tempDir` : ImageMagick y copie le PDF entier, sinon il le copie dans le temporaire de Windows.
const pdfToimg = async (readFile, writeFile, rotate = 0, zone = null, tempDir = null) => {
  if (!fs.existsSync(readFile)) {
    throw new Error(`PDF introuvable pour la conversion en image : ${readFile}`);
  }
  const rotateArgs = rotate ? ["-rotate", String(rotate)] : [];
  const cropArgs = zone
    ? ["-crop", `${pixels(zone.largeur)}x${pixels(zone.hauteur)}+${pixels(zone.x)}+${pixels(zone.y)}`, "+repage"]
    : [];
  await execFileAsync(
    "convert",
    ["-density", String(DENSITY), `pdf:${readFile}[0]`, "-background", "white", "-flatten", ...cropArgs, ...rotateArgs, "-quality", "90", `jpg:${writeFile}`],
    {
      timeout: CONVERT_TIMEOUT_MS,
      windowsHide: true,
      env: tempDir ? { ...process.env, MAGICK_TEMPORARY_PATH: tempDir } : process.env,
    },
  );

  if (!fs.existsSync(writeFile) || fs.statSync(writeFile).size === 0) {
    throw new Error(`Échec de la génération de l'image JPG : ${writeFile}`);
  }
  logger.debug("Image générée");
};

module.exports = async ({ pdf, jpg, rotate, zone, tempDir }) => {
  await pdfToimg(pdf, jpg, rotate, zone, tempDir);
};
