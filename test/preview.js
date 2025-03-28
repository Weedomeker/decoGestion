const { PDFDocument } = require('pdf-lib');
const PDFDocumentKit = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');
const fs = require('fs');
const chalk = require('chalk');
const { parseStringPromise } = require('xml2js'); // Importer xml2js
const { cmToPoints, pointsToCm } = require('../server/src/convertUnits');

async function addSvgToPdf(pdfPath, svgContent, outputPath) {
  try {
    // Valider le contenu SVG
    if (!isValidSvg(svgContent)) {
      throw new Error('Le contenu fourni n’est pas un SVG valide.');
    }

    // Charger le fichier PDF existant
    const existingPdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    // Extraire les dimensions du SVG
    const { width: svgWidth, height: svgHeight } = await getSvgDimensions(svgContent);

    // Créer un document PDF temporaire avec le SVG
    const tempPdfBytes = await createPdfFromSvg(svgContent, pdfDoc);

    // Intégrer le PDF temporaire en tant qu'objet PDF dans le PDF principal
    const [embeddedPdf] = await pdfDoc.embedPdf(tempPdfBytes);

    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();

    // Calculer les coordonnées pour centrer le SVG sans changer ses dimensions
    const x = 0; // Centrage horizontal
    const y = 0; // Centrage vertical
    // const x = (width - svgWidth) / 2; // Centrage horizontal
    // const y = (height - svgHeight) / 2; // Centrage vertical

    // Dessiner l'objet PDF intégré dans la première page du document
    firstPage.drawPage(embeddedPdf, {
      x: x, // Position X centrée
      y: y, // Position Y centrée
      width: svgWidth, // Utiliser la largeur d'origine du SVG
      height: svgHeight, // Utiliser la hauteur d'origine du SVG
    });

    // Sauvegarder le document PDF modifié
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
    console.log(chalk.green('SVG superposé avec succès sur le PDF'));
  } catch (error) {
    console.error(chalk.red('Erreur lors de la superposition du SVG :'), error.message);
  }
}

// Fonction pour valider si le contenu est un SVG valide
function isValidSvg(svgContent) {
  // Vérifier que le SVG contient les balises de base <svg>...</svg>
  const regex = /<svg[^>]*>([\s\S]*?)<\/svg>/i;
  const match = regex.test(svgContent);
  //console.log('Résultat de la validation SVG :', match ? 'Valide' : 'Non valide');
  return match;
}

// Fonction pour extraire les dimensions du SVG
async function getSvgDimensions(svgContent) {
  try {
    const result = await parseStringPromise(svgContent);
    const svgAttributes = result.svg.$; // Récupérer les attributs de la balise <svg>
    console.log(svgAttributes.height);
    const width = cmToPoints(parseFloat(svgAttributes.width)) || 0; // Obtenir la largeur
    const height = cmToPoints(parseFloat(svgAttributes.height)) || 0; // Obtenir la hauteur
    return { width, height };
  } catch (error) {
    throw new Error("Erreur lors de l'extraction des dimensions du SVG : " + error.message);
  }
}

// Fonction pour créer un PDF temporaire à partir d'un SVG
async function createPdfFromSvg(svgContent, pdfDoc) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocumentKit({ autoFirstPage: false });
    let chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    // Ajouter une page vierge au document temporaire
    doc.addPage({ size: [pdfDoc.getPage(0).getWidth(), pdfDoc.getPage(0).getHeight()] });

    // Convertir le SVG en PDF avec svg-to-pdfkit
    try {
      SVGtoPDF(doc, svgContent, 0, 0);
    } catch (e) {
      reject(new Error('SVGtoPDF: Impossible de convertir le SVG'));
    }
    doc.end();
  });
}

// const pdfPath = './test/DIBOND 101X215-TEST_JOHN 100x200_73800993_S_.pdf';
// const svgContent = fs.readFileSync('./test/100x200.svg', 'utf8');
// const outputPath = './test/preview.pdf';

// addSvgToPdf(pdfPath, svgContent, outputPath).catch((err) => console.error('Erreur :', err));

module.exports = addSvgToPdf;
