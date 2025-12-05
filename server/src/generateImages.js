const { Jimp } = require("jimp");
const path = require("path");
const logger = require("./logger/logger");

async function generateImages(data, readFile, writeFile) {
  const imagePath = readFile + "/" + data.visuel + ".jpg";
  const format = data.format_visu?.split("_")?.pop();

  let fileName = path.basename(writeFile);
  // fileName = fileName?.split(' - ');
  // fileName?.splice(2, 1, format);
  // fileName = fileName?.join(' - ');
  try {
    // Charger l'image
    const image = await Jimp.read(imagePath);

    await image.rotate(90, false);
    // Sauvegarder l'image modifiée
    await image.write(path.dirname(writeFile) + "/" + fileName);
  } catch (err) {
    logger.error("❌ Erreur :", err);
  }
}

module.exports = generateImages;
