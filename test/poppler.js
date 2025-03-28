const poppler = require('pdf-poppler');
const path = require('path');

async function convertPdfToJpg(workerData) {
  // Récupère les données PDF et JPG du worker
  const { pdf, jpg } = workerData;

  if (!pdf || !jpg) {
    throw new Error('Données PDF ou JPG manquantes !');
  }

  const outputPrefix = path.basename(pdf, path.extname(pdf));
  const opts = {
    format: 'jpeg',
    out_dir: path.dirname(jpg), // Utilise le bon dossier pour la sortie
    out_prefix: outputPrefix, // Préfixe de sortie
    page: 1, // Convertir la première page en image
  };

  try {
    await poppler.convert(pdf, opts);
    // Retourne le chemin du fichier généré
    return { success: true, file: `${path.dirname(jpg)}/${outputPrefix}-1.jpg` };
  } catch (error) {
    throw new Error(`Erreur de conversion : ${error.message}`);
  }
}

// Exporte la fonction correctement pour être utilisée par Piscina
module.exports = convertPdfToJpg;
