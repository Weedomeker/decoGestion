const fs = require("fs");
const path = require("path");
const { Jimp } = require("jimp");

const getPreview = async (ref, jpgName) => {
  try {
    const previewDir = path.join(__dirname, "../public/preview");
    const files = fs.readdirSync(previewDir);

    const file = files.find((f) => f.includes(ref));

    if (!file) {
      console.log("preview: file not found");
      return false;
    }

    const sourcePath = path.join(previewDir, file);
    const destPath = path.resolve(`${jpgName}.jpg`);

    // 🔄 Charger l'image et la tourner de 90°
    const image = await Jimp.read(sourcePath);
    await new Promise((resolve, reject) => {
      image.rotate(90, false).write(destPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return destPath;
  } catch (err) {
    console.error("Error in getPreview:", err);
    return false;
  }
};

module.exports = getPreview;
