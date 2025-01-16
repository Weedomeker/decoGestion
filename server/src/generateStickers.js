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
  { cmd: 54542, ex: 1 },

  { cmd: 54542, ex: 4 },
];
async function generateStickers(commande, outPath) {
  if (commande[0].length > 0) return;
  if (!fs.existsSync(outPath)) {
    fs.mkdirSync(outPath, { recursive: true });
  }

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
      y: height - textHeight * 3,
      size: 30,
      font: font,
      color: rgb(0, 0, 0),
    });

    const pdfBytes = await pdfDoc.save();

    if (!fs.existsSync(outPath)) {
      fs.mkdirSync(outPath, { recursive: true });
    }
    await fs.promises.writeFile(`${outPath}/${text}.pdf`, pdfBytes);
  } catch (error) {
    console.error('La génération des étiquettes a echoué: ', error);
  }
}

async function createStickersPage(directory, outputPath, pageSize = 'A4') {
  const dimensions =
    pageSize === 'A3'
      ? { width: 842, height: 1191 } // Dimensions pour A3
      : { width: 595, height: 842 }; // Dimensions pour A4

  const margin = 0; // Marge entre les pages
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

      const inputPage = inputPdf.getPage(0); // Charger la première page
      const { width, height } = inputPage.getSize();
      const isLandscape = width > height;

      const scaledWidth = isLandscape ? 595 : 420;
      const scaledHeight = isLandscape ? 420 : 595;
      let rotation = isLandscape ? degrees(0) : degrees(90);

      const embeddedPage = await outputPdf.embedPage(inputPage);

      if (itemCount % (pageSize === 'A3' ? 4 : 2) === 0) {
        currentPage = outputPdf.addPage([dimensions.width, dimensions.height]);
      }

      const positionIndex = itemCount % (pageSize === 'A3' ? 4 : 2);
      let x = 0;
      let y = 0;

      if (pageSize === 'A3') {
        // A3 -> 4 A5 par page
        if (positionIndex === 0) {
          // En haut à gauche
          x = (dimensions.width / 2 - scaledWidth) / 2;
          y = dimensions.height - scaledHeight - margin;
          rotation = isLandscape ? degrees(0) : degrees(90); // Orientation dynamique
        } else if (positionIndex === 1) {
          // En haut à droite
          x = (dimensions.width / 2 - scaledWidth) / 2 + dimensions.width / 2;
          y = dimensions.height - scaledHeight - margin;
          rotation = isLandscape ? degrees(0) : degrees(90); // Orientation dynamique
        } else if (positionIndex === 2) {
          // En bas à gauche
          x = (dimensions.width / 2 - scaledWidth) / 2;
          y = dimensions.height / 2 - scaledHeight - margin;
          rotation = isLandscape ? degrees(0) : degrees(90); // Orientation dynamique
        } else if (positionIndex === 3) {
          // En bas à droite
          x = (dimensions.width / 2 - scaledWidth) / 2 + dimensions.width / 2;
          y = dimensions.height / 2 - scaledHeight - margin;
          rotation = isLandscape ? degrees(0) : degrees(90); // Orientation dynamique
        }
      } else {
        if (positionIndex === 0) {
          x = (dimensions.width - scaledWidth) / 2;
          y = dimensions.height - scaledHeight - margin;
        } else if (positionIndex === 1) {
          x = (dimensions.width - scaledWidth) / 2;
          y = dimensions.height / 2 - scaledHeight - margin;
        }
      }

      currentPage.drawPage(embeddedPage, {
        x,
        y,
        width: scaledWidth,
        height: scaledHeight,
        rotate: rotation,
      });

      itemCount++;
    } catch (error) {
      console.error(`Erreur lors du traitement du fichier ${file}:`, error.message);
    }
  }

  try {
    const pdfBytes = await outputPdf.save();
    fs.writeFileSync(outputPath, pdfBytes);
    console.log(`Etiquettes mis en page enregistré sous : ${outputPath}`);
  } catch (error) {
    console.error('Erreur lors de la sauvegarde du fichier PDF :', error.message);
  }
}

const directoryPath = path.join(__dirname, '../public/PRINTSA#16 JANV 2025'); // Répertoire contenant les PDF A5
const outputFilePath = directoryPath + '/Etiquettes' + '/Etiquettes.pdf'; // Nom du fichier PDF généré
(async function () {
  try {
    await generateStickers(arr, directoryPath + '/' + 'Etiquettes');
    await createStickersPage(directoryPath + '/Etiquettes', outputFilePath, 'A3').catch((error) => console.log(error));
  } catch (error) {
    console.log(error);
  }
})();

// module.exports = { generateStickers, createStickersPage };
