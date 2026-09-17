const Jimp = require("jimp");
const path = require("path");
const fs = require("fs");
const logger = require("./logger/logger");

async function generateImages(data, readFile, writeFile, isStock) {
  if (!data.ref) {
    logger.warn(`generateImages: ref absente pour "${data.visuel}", image ignorée`);
    return;
  }

  const refStr = String(data.ref);
  const dirFiles = fs.readdirSync(readFile);
  const matched = dirFiles.find((file) => file.includes(refStr));
  if (!matched) {
    logger.warn(`generateImages: aucun JPG trouvé pour la ref "${refStr}" dans ${readFile}`);
    return;
  }
  const imagePath = path.join(readFile, matched);

  const fileName = path.basename(writeFile);

  try {
    const image = await Jimp.read(imagePath);
    const fontWhite = await Jimp.loadFont(Jimp.FONT_SANS_128_WHITE);
    const fontBlack = await Jimp.loadFont(Jimp.FONT_SANS_128_BLACK);

    // 👉 Rotation AVANT d'écrire
    image.rotate(90);

    if (isStock) {
      function printWithStrokeCentered(image, fontMain, fontStroke, text, size = 2) {
        const w = image.bitmap.width;
        const h = image.bitmap.height;

        const options = {
          text,
          alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
          alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE,
        };

        // 👉 contour
        for (let dx = -size; dx <= size; dx++) {
          for (let dy = -size; dy <= size; dy++) {
            if (dx !== 0 || dy !== 0) {
              image.print(fontStroke, dx, dy, options, w, h);
            }
          }
        }

        // 👉 texte principal
        image.print(fontMain, 0, 0, options, w, h);
      }
      printWithStrokeCentered(image, fontWhite, fontBlack, "EN STOCK", 3);
    }

    await image.writeAsync(path.join(path.dirname(writeFile), fileName));
  } catch (err) {
    logger.error("❌ Erreur :", err);
  }
}

module.exports = generateImages;
