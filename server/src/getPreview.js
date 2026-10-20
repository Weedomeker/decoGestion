const fs = require("fs");
const path = require("path");
const Jimp = require("jimp");
const logger = require("./logger/logger");

const PREVIEW_DIR = path.join(__dirname, "../public/preview");

function normalizeWords(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\.[A-Z]+$/, "")
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

// Plusieurs aperçus peuvent contenir la même ref : on garde celui qui a le moins de mots absents
// du nom du visuel. Sans nom de visuel, ou à égalité, le premier trouvé (comportement historique).
// Une ref de remplissage ("00000000", 78 aperçus) n'identifie aucun visuel : pas d'aperçu.
// Utilisé par les jobs (getPreview) et les étiquettes (generateStickers).
function findPreviewFile(ref, visuelName, files = fs.readdirSync(PREVIEW_DIR)) {
  if (!ref || /^0+$/.test(String(ref))) return undefined;
  const refLower = String(ref).toLowerCase();
  const candidates = files.filter((f) => /\.jpe?g$/i.test(f) && f.toLowerCase().includes(refLower));
  if (candidates.length <= 1 || !visuelName) return candidates[0];

  const visuelWords = new Set(normalizeWords(path.basename(visuelName)));
  const extraWords = (file) => normalizeWords(file).filter((w) => !visuelWords.has(w)).length;
  return candidates.reduce((best, file) => (extraWords(file) < extraWords(best) ? file : best));
}

const getPreview = async (ref, jpgName, isStock, visuelName, previewDir = PREVIEW_DIR) => {
  try {
    const file = findPreviewFile(ref, visuelName, fs.readdirSync(previewDir));

    if (!file) {
      logger.debug("getPreview : aperçu introuvable");
      return false;
    }

    const sourcePath = path.join(previewDir, file);
    const destPath = path.resolve(`${jpgName}.jpg`);

    // 🔄 Charger l'image et la tourner de 90° si la largeur est plus petite que la longueur, et si isStock ecrire Stock centrer dans l'image
    const image = await Jimp.read(sourcePath);

    // rotate(90) agrandit le canevas aux nouvelles dimensions ; rotate(90, false) gardait le canevas
    // d'origine et recadrait les aperçus en paysage.
    if (image.bitmap.width > image.bitmap.height) {
      image.rotate(90);
    }

    await new Promise((resolve, reject) => {
      image.write(destPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return destPath;
  } catch (err) {
    logger.error("getPreview : échec :", err);
    return false;
  }
};

module.exports = getPreview;
module.exports.findPreviewFile = findPreviewFile;
