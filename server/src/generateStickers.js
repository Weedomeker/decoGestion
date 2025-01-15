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
function generateStickers(commande, outPath) {
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

  summedByCmd.map((cmd) => {
    let numCmd = cmd.cmd;
    let ex = cmd.ex;
    if (ex > 1) {
      for (let i = 0; i < ex; i++) {
        createStickers(numCmd, i + 1, outPath);
        // console.log(`${numCmd}_${i + 1}`);
      }
    } else {
      createStickers(numCmd, ex, outPath);
      // console.log(numCmd);
    }
  });
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
    const text = `${numCmd.toString()}_${ex} `;
    const textWidth = font.widthOfTextAtSize(text, 35);
    const textHeight = font.heightAtSize(35);

    firstPage.drawText(text, {
      x: width / 2 - textWidth / 2,
      y: height - textHeight,
      size: 35,
      font: font,
      color: rgb(0, 0, 0),
    });

    const pdfBytes = await pdfDoc.save();

    if (!fs.existsSync(outPath)) {
      fs.mkdirSync(outPath, { recursive: true });
    }
    await fs.promises.writeFile(`${outPath}/Etiquette_${text}.pdf`, pdfBytes);
  } catch (error) {
    console.error('La génération des étiquettes a echoué: ', error);
  }
}
async function createStickersPage(directory, outputPath, pageSize = 'A4') {
  const dimensions =
    pageSize === 'A3'
      ? { width: 842, height: 1191 } // Dimensions pour A3
      : { width: 595, height: 842 }; // Dimensions pour A4

  const A5Width = 420; // Largeur approximative pour une page A5
  const A5Height = 595; // Hauteur approximative pour une page A5

  const outputPdf = await PDFDocument.create();

  const files = fs.readdirSync(directory).filter((file) => file.endsWith('.pdf'));
  console.log('Fichiers trouvés :', files);

  let currentPage = null;
  let currentX = 0;
  let currentY = dimensions.height - A5Height;

  for (const file of files) {
    const filePath = path.join(directory, file);
    const pdfBytes = fs.readFileSync(filePath);
    const inputPdf = await PDFDocument.load(pdfBytes);

    // Intégrer la première page du fichier PDF
    const [embeddedPage] = await outputPdf.embedPages(await inputPdf.getPages(), [0]);

    if (!currentPage || currentY < 0) {
      // Crée une nouvelle page si nécessaire
      currentPage = outputPdf.addPage([dimensions.width, dimensions.height]);
      currentX = 0;
      currentY = dimensions.height - A5Height;
    }

    // Dessiner la page copiée sur la page actuelle
    currentPage.drawPage(embeddedPage, {
      x: currentX,
      y: currentY,
      width: A5Width,
      height: A5Height,
    });

    // Ajuster la position pour la prochaine page
    if (currentX === 0) {
      currentX += A5Width; // Passer à la colonne de droite
    } else {
      currentX = 0; // Retour à gauche
      currentY -= A5Height; // Descendre d'une ligne
    }

    // Créer une nouvelle page si l'espace restant est insuffisant
    if (currentY < 0) {
      currentPage = outputPdf.addPage([dimensions.width, dimensions.height]);
      currentX = 0;
      currentY = dimensions.height - A5Height;
    }
  }

  // Sauvegarder le PDF généré
  const pdfBytes = await outputPdf.save();
  fs.writeFileSync(outputPath, pdfBytes);

  console.log(`PDF mis en page enregistré sous : ${outputPath}`);
}

const directoryPath = path.join(__dirname, '../public/PRINTSA#15 JANV 2025'); // Répertoire contenant les PDF A5
const outputFilePath = 'output_layout.pdf';
// async function test() {
//   await generateStickers(arr, directoryPath + '/Etiquettes');
//   await createStickersPage(directoryPath, outputFilePath, 'A4');
// }

createStickersPage(directoryPath + '/Etiquettes', outputFilePath, 'A4').catch((err) => console.error(err));
// module.exports = generateStickers;
