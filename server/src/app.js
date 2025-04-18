const { degrees, PDFDocument, rgb, StandardFonts } = require('pdf-lib');
require('dotenv').config();
const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || 8000;
const fs = require('fs');
const { cmToPoints, pointsToCm, cmToPxl } = require('./convertUnits');

async function modifyPdf(filePath, writePath, fileName, format, formatTauro, reg, data) {
  try {
    const readPdf = await fs.promises.readFile(filePath);
    const pdfDoc = await PDFDocument.load(readPdf);
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const [wSize, hSize] = format.split('x').map(Number);
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();

    const fTauro = formatTauro.split('_').pop();
    const [largeurPlaqueCm, longueurPlaqueCm] = fTauro.split('x').map(Number);

    // Utiliser cmToPoints pour avoir des coordonnées cohérentes
    const largeurPlaque = cmToPoints(largeurPlaqueCm);
    const longueurPlaque = cmToPoints(longueurPlaqueCm);

    let xPosition = cmToPoints(0.5);
    let textSize = 35;
    const text = fileName;
    const textWidth = helveticaFont.widthOfTextAtSize(text, textSize);

    // Ajout de repères
    if (reg) {
      const drawRegmarks = (xReg, yReg, sizeReg = 0.6) => {
        firstPage.drawCircle({
          x: xReg, // haut - bas
          y: yReg, // gauche - droite
          size: cmToPoints(sizeReg / 2), // Conversion de cm à points pour la taille du cercle
          color: rgb(0, 0, 0),
        });
      };
      // Calcul de la position des repères en points (en utilisant cmToPoints)
      let regSize = cmToPoints(0.3);
      let regPosition = regSize + cmToPoints(1);
      // drawRegmarks(-regPosition, height - regPosition);
      // drawRegmarks(-regPosition, height - regPosition - cmToPoints(10));
      // drawRegmarks(-regPosition, regPosition);
      // drawRegmarks(width + regPosition, regPosition);
      // drawRegmarks(width + regPosition, height - regPosition);
      // 1 --------------------- 4
      // 2                       |
      //                         |
      //                         |
      // 3 --------------------- 5
      drawRegmarks(width - regPosition, height + regPosition); //1
      drawRegmarks(width - regPosition - cmToPoints(10), height + regPosition); //2
      drawRegmarks(regPosition, height + regPosition); // 3

      drawRegmarks(width - regPosition, -regPosition); // 4
      drawRegmarks(regPosition, -regPosition); // 5
    }

    firstPage.drawText(text, {
      x: width / 2 - textWidth / 2,
      y: height + xPosition,
      size: textSize,
      font: helveticaFont,
      color: rgb(0, 0, 0),
      rotate: degrees(0),
    });

    firstPage.setRotation(degrees(-90)); // Appliquer une rotation de 90°
    firstPage.setSize(largeurPlaque, longueurPlaque);
    firstPage.translateContent((largeurPlaque - width) / 2, (longueurPlaque - height) / 2);
    firstPage.setTrimBox(0, 0, largeurPlaque, longueurPlaque);

    const pdfBytes = await pdfDoc.save();
    await fs.promises.writeFile(`${writePath}/${text}.pdf`, pdfBytes);
  } catch (error) {
    console.error("Une erreur s'est produite lors de la modification du PDF :", error);
  }
}

module.exports = modifyPdf;
