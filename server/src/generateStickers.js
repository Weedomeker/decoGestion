/**
 * Génère des étiquettes PDF pour chaque commande
 * @param {Array<Object>} commande - Tableau d'objets contenant les numéros de commande et le nombre d'exemplaires
 * @param {string} outPath - Chemin du dossier où seront enregistrées les étiquettes
 */
const { degrees, PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const { cmToPoints } = require('./convertUnits');
const path = require('path');

const arr = [
  { cmd: 54540, ex: 1 },
  { cmd: 54541, ex: 1 },
  { cmd: 54542, ex: 1 },
  { cmd: 54542, ex: 2 },
  { cmd: 54542, ex: 4 },
];
async function generateStickers(commande, outPath) {
  if (commande[0].length > 0) return;

  const summedByCmd = commande.reduce((acc, curr) => {
    const { cmd, ex } = curr;
    const existing = acc.find((item) => item.cmd === cmd);
    if (existing) {
      existing.ex += ex;
    } else {
      acc.push({ cmd, ex });
    }
    return acc;
  }, []);

  const promises = summedByCmd.map(async (cmd) => {
    let numCmd = cmd.cmd;
    let ex = cmd.ex;
    if (ex > 1) {
      for (let i = 0; i < ex; i++) {
        await createStickers(numCmd, i + 1, outPath);
      }
    } else {
      await createStickers(numCmd, ex, outPath);
    }
  });

  await Promise.all(promises);
}

async function createStickers(numCmd, ex, outPath) {
  const originalNotice = path.join(__dirname, '../public/images/notice_deco.pdf');

  try {
    const readPdf = await fs.promises.readFile(originalNotice);
    const pdfDoc = await PDFDocument.load(readPdf);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();
    const text = `${numCmd.toString()}_${ex}`;
    const textWidth = font.widthOfTextAtSize(text, 35);
    const textHeight = font.heightAtSize(35);

    firstPage.drawText(text, {
      x: width / 2 - textWidth / 2,
      y: height - textHeight * 1.5,
      size: 30,
      font: font,
      color: rgb(0, 0, 0),
    });

    const pdfBytes = await pdfDoc.save();

    if (!fs.existsSync(outPath)) {
      fs.mkdirSync(outPath, { recursive: true });
    }
    await fs.promises.writeFile(`${outPath}/Etiquette${text}.pdf`, pdfBytes);
  } catch (error) {
    console.error('La génération des étiquettes a echoué: ', error);
  }
}

async function createStickersPage(directory, outputPath, pageSize = 'A4') {
  // Dimensions de la page A4 et A3
  const dimensions =
    pageSize === 'A3'
      ? { width: 842, height: 1191 } // Dimensions pour A3
      : { width: 595, height: 842 }; // Dimensions pour A4

  // Dimensions de la page A5 en portrait et paysage
  const A5_Orientation = pageSize === 'A3' ? { width: 420, height: 595 } : { width: 595, height: 420 };
  const scaleFactor = 1; // Réduction des pages A5 pour les ajuster
  const margin = 0; // Marge entre les pages

  // Calcul des dimensions réduites des pages A5
  const scaledWidth = A5_Orientation.width * scaleFactor;
  const scaledHeight = A5_Orientation.height * scaleFactor;

  const outputPdf = await PDFDocument.create();
  const files = fs.readdirSync(directory).filter((file) => file.endsWith('.pdf'));

  if (files.length === 0) {
    console.error('Aucun fichier PDF trouvé dans le répertoire.');
    return;
  }

  let currentPage = null;
  let itemCount = 0; // Compteur global pour savoir où placer chaque page A5

  for (const file of files) {
    try {
      const filePath = path.join(directory, file);
      const pdfBytes = fs.readFileSync(filePath);
      const inputPdf = await PDFDocument.load(pdfBytes);

      const embeddedPage = await outputPdf.embedPage(inputPdf.getPage(0));

      // Créer une nouvelle page si nécessaire (A3 = 4 A5, A4 = 2 A5)
      if (itemCount % (pageSize === 'A3' ? 4 : 2) === 0) {
        currentPage = outputPdf.addPage([dimensions.width, dimensions.height]);
      }

      // Calculer la position de l'élément
      const positionIndex = itemCount % (pageSize === 'A3' ? 4 : 2);

      let x = 0;
      let y = 0;
      let rotation = pageSize === 'A3' ? degrees(0) : degrees(90); // Rotation de 90 degrés pour chaque A5
      // Placement des pages pour A4 ou A3
      if (pageSize === 'A3') {
        // A3 -> 4 A5 par page
        if (positionIndex === 0) {
          // En haut à gauche
          x = (dimensions.width / 2 - scaledWidth) / 2; // Centré horizontalement
          y = dimensions.height - scaledHeight - margin;
        } else if (positionIndex === 1) {
          // En haut à droite
          x = (dimensions.width / 2 - scaledWidth) / 2 + dimensions.width / 2; // Centré horizontalement
          y = dimensions.height - scaledHeight - margin;
        } else if (positionIndex === 2) {
          // En bas à gauche
          x = (dimensions.width / 2 - scaledWidth) / 2; // Centré horizontalement
          y = dimensions.height / 2 - scaledHeight - margin;
        } else if (positionIndex === 3) {
          // En bas à droite
          x = (dimensions.width / 2 - scaledWidth) / 2 + dimensions.width / 2; // Centré horizontalement
          y = dimensions.height / 2 - scaledHeight - margin;
        }
      } else {
        // A4 -> 2 A5 par page
        if (positionIndex === 0) {
          // En haut à gauche
          x = (dimensions.width + scaledWidth) / 2; // Centré horizontalement
          y = dimensions.height - scaledHeight - margin;
        } else if (positionIndex === 1) {
          // En bas à gauche
          x = (dimensions.width + scaledWidth) / 2; // Centré horizontalement
          y = dimensions.height / 2 - scaledHeight - margin;
        }
      }

      // Dessiner la page copiée à la position calculée avec rotation
      currentPage.drawPage(embeddedPage, {
        x,
        y,
        width: pageSize === 'A3' ? scaledWidth : scaledHeight,
        height: pageSize === 'A3' ? scaledHeight : scaledWidth,
        rotate: rotation, // Appliquer la rotation de 90 degrés
      });

      itemCount++;
    } catch (error) {
      console.error(`Erreur lors du traitement du fichier ${file}:`, error.message);
    }
  }

  try {
    // Sauvegarder le PDF généré
    const pdfBytes = await outputPdf.save();
    fs.writeFileSync(outputPath, pdfBytes);
    console.log(`PDF mis en page enregistré sous : ${outputPath}`);
  } catch (error) {
    console.error('Erreur lors de la sauvegarde du fichier PDF :', error.message);
  }
}

const directoryPath = path.join(__dirname, '../public/tmp'); // Répertoire contenant les PDF A5
const outputFilePath = 'output_layout.pdf';
(async function () {
  try {
    await generateStickers(arr, directoryPath + '/Etiquettes');
    await createStickersPage(directoryPath + '/Etiquettes', outputFilePath, 'A3');
  } catch (error) {
    console.log(error);
  }
})();

// module.exports = generateStickers;
