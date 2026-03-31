const fs = require("fs");
const path = require("path");
const { Jimp, loadFont } = require("jimp");
const { SANS_32_BLACK } = require("jimp/fonts");
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

    // 🔄 Charger l'image et la tourner de 90° et si isStock ecrire Stock centrer dans l'image
    const image = await Jimp.read(sourcePath);
    const font = await loadFont(SANS_32_BLACK);

    await new Promise((resolve, reject) => {
      image.rotate(90, false).write(destPath, (err) => {
        if (isStock) {
          console.log("DANS STOCK");
          image.print(font, 150, 150, "EN STOCK");
        }
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
