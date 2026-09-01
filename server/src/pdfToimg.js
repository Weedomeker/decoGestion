const { pdftobuffer } = require("pdftopic");
const fs = require("fs");
const logger = require("./logger/logger");

const pdfToimg = async (readFile, writeFile) => {
  if (!fs.existsSync(readFile)) {
    throw new Error(`PDF introuvable pour la conversion en image : ${readFile}`);
  }
  const pdf = fs.readFileSync(readFile);
  const buffer = await pdftobuffer(pdf, 0);
  fs.writeFileSync(writeFile, buffer);

  if (!fs.existsSync(writeFile) || fs.statSync(writeFile).size === 0) {
    throw new Error(`Échec de la génération de l'image JPG : ${writeFile}`);
  }
  logger.info("Image générée avec succès");
};

module.exports = async ({ pdf, jpg }) => {
  await pdfToimg(pdf, jpg);
};
