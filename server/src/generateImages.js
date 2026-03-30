const { Jimp } = require("jimp");
const path = require("path");
const fs = require("fs");
const logger = require("./logger/logger");

async function generateImages(data, readFile, writeFile) {
  let imagePath = readFile + "/" + data.visuel + ".jpg";
  //chercher fichier incluant reference dans son nom
  fs.readdirSync(readFile).forEach((file) => {
    if (file.includes(data.ref)) {
      imagePath = path.join(readFile, file);
    }
  });

  let fileName = path.basename(writeFile);

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
