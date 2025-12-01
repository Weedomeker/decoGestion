const QRCode = require("qrcode");
const fs = require("fs");

/**
 * La fonction `generateQrCode` génère un code QR à partir des données et des options spécifiées.
 * @param {string} data - Les données à encoder dans le QRcode.
 * @param {string} path - Chemin de sortie du QRCode.
 * @param {object} [options] - Les options personnalisées pour la génération du QRcode.
 */
const generateQrCode = async (data, path, options) => {
  try {
    // Génère et sauvegarde le QR code dans un fichier avec les options fournies
    await QRCode.toFile(path, data, options);
  } catch (error) {
    console.error("Erreur lors de la génération du QR Code :", error);
  }
};

module.exports = generateQrCode;
