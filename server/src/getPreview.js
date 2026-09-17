const fs = require("fs");
const path = require("path");
const Jimp = require("jimp");
const logger = require("./logger/logger");

const getPreview = async (ref, jpgName, isStock) => {
  try {
    const previewDir = path.join(__dirname, "../public/preview");
    const files = fs.readdirSync(previewDir);

    const file = files.find((f) => f.includes(ref));

    if (!file) {
      logger.info("preview: file not found");
      return false;
    }

    const sourcePath = path.join(previewDir, file);
    const destPath = path.resolve(`${jpgName}.jpg`);

    // 🔄 Charger l'image et la tourner de 90° si la largeur est plus petite que la longueur, et si isStock ecrire Stock centrer dans l'image
    const image = await Jimp.read(sourcePath);

    if (image.bitmap.width > image.bitmap.height) {
      image.rotate(90, false);
    }

    await new Promise((resolve, reject) => {
      image.write(destPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return destPath;
  } catch (err) {
    logger.error("Error in getPreview:", err);
    return false;
  }
};

module.exports = getPreview;
