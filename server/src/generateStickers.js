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
      }
    } else {
      createStickers(numCmd, ex, outPath);
    }
  });
}

/**
 * Génère une étiquette PDF pour une commande
 * @param {number} numCmd - Numéro de commande
 * @param {number} ex - Numéro d'exemplaire
 * @param {string} outPath - Chemin du dossier où sera enregistrée l'étiquette
 */
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

// generateStickers(arr, path.join(__dirname, '../public/tmp/'));

module.exports = generateStickers;
