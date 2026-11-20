const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const os = require("os");
const path = require("path");
const logger = require("./logger/logger");

const execFileAsync = promisify(execFile);

// Le JPG ne sert que d'aperçu, ramené ensuite à un A4/A3 de ~1750 px par composeJpgPage.
// À 30 DPI une plaque de 305 cm fait ~3600 px : largement suffisant. L'ancien rendu à 200 DPI
// (pdftopic) produisait ~12000x24000 px et prenait plusieurs minutes par crédence.
const DENSITY = 30;
const CONVERT_TIMEOUT_MS = 5 * 60 * 1000;
const GHOSTSCRIPT = process.env.GHOSTSCRIPT || (process.platform === "win32" ? "gswin64c" : "gs");
const ENCRES_CMJN = ["Cyan", "Magenta", "Yellow", "Black"];

const pixels = (mm) => Math.round((mm / 25.4) * DENSITY);

const optionsExec = (tempDir) => ({
  timeout: CONVERT_TIMEOUT_MS,
  windowsHide: true,
  env: tempDir ? { ...process.env, MAGICK_TEMPORARY_PATH: tempDir } : process.env,
});

// Les PDF « +BLANC » portent une encre d'accompagnement WHITE dont la couleur d'affichage est
// magenta : rendue telle quelle, elle recouvre l'image de rose. Ghostscript sépare les encres
// (tiffsep : une image par encre, 0 = encre pleine), puis seules cyan, magenta, jaune et noir sont
// recomposées. Le PDF n'est que lu : le blanc part intact à l'impression. Les autres encres
// d'accompagnement disparaissent aussi de l'aperçu.
async function rendreSansBlanc(readFile, tempDir) {
  const dossier = await fs.promises.mkdtemp(path.join(tempDir || os.tmpdir(), "sansblanc-"));
  const sortie = path.join(dossier, "p.tif");
  await execFileAsync(
    GHOSTSCRIPT,
    // Ghostscript n'ouvre pas un chemin réseau « //serveur/... » : `path.normalize` le rend en « \\serveur\... ».
    ["-q", "-dNOPAUSE", "-dBATCH", "-dSAFER", "-sDEVICE=tiffsep", `-r${DENSITY}`, "-dFirstPage=1", "-dLastPage=1", `-sOutputFile=${sortie}`, path.normalize(readFile)],
    optionsExec(tempDir),
  );
  const encres = ENCRES_CMJN.map((encre) => path.join(dossier, `p(${encre}).tif`));
  const manquante = encres.find((f) => !fs.existsSync(f));
  if (manquante) throw new Error(`Séparation absente : ${path.basename(manquante)}`);
  return { dossier, entree: [...encres, "-negate", "-set", "colorspace", "CMYK", "-combine", "-colorspace", "sRGB"] };
}

// `rotate` (degrés, sens horaire) s'applique après le rendu, qui respecte déjà le /Rotate du PDF.
// `zone` (mm, origine en haut à gauche) recadre le rendu avant la rotation.
// `tempDir` : ImageMagick y copie le PDF entier, sinon il le copie dans le temporaire de Windows.
// `sansBlanc` : job avec blanc, rendu sans l'encre WHITE (voir rendreSansBlanc).
const pdfToimg = async (readFile, writeFile, rotate = 0, zone = null, tempDir = null, sansBlanc = false) => {
  if (!fs.existsSync(readFile)) {
    throw new Error(`PDF introuvable pour la conversion en image : ${readFile}`);
  }
  const rotateArgs = rotate ? ["-rotate", String(rotate)] : [];
  const cropArgs = zone
    ? ["-crop", `${pixels(zone.largeur)}x${pixels(zone.hauteur)}+${pixels(zone.x)}+${pixels(zone.y)}`, "+repage"]
    : [];

  let entree = ["-density", String(DENSITY), `pdf:${readFile}[0]`];
  let dossierSeparations = null;
  if (sansBlanc) {
    try {
      ({ dossier: dossierSeparations, entree } = await rendreSansBlanc(readFile, tempDir));
    } catch (err) {
      // Un aperçu rose vaut mieux qu'un job bloqué : le PDF d'impression n'en dépend pas.
      logger.warn(`Rendu sans blanc impossible (${err.message}) : JPG rendu avec le blanc en magenta.`);
    }
  }

  try {
    await execFileAsync(
      "convert",
      [...entree, "-background", "white", "-flatten", ...cropArgs, ...rotateArgs, "-quality", "90", `jpg:${writeFile}`],
      optionsExec(tempDir),
    );
  } finally {
    if (dossierSeparations) await fs.promises.rm(dossierSeparations, { recursive: true, force: true });
  }

  if (!fs.existsSync(writeFile) || fs.statSync(writeFile).size === 0) {
    throw new Error(`Échec de la génération de l'image JPG : ${writeFile}`);
  }
  logger.debug("Image générée");
};

module.exports = async ({ pdf, jpg, rotate, zone, tempDir, sansBlanc }) => {
  await pdfToimg(pdf, jpg, rotate, zone, tempDir, sansBlanc);
};
