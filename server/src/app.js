const { degrees, PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const { cmToPoints, pointsToCm } = require('./convertUnits').default;

async function modifyPdf(filePath, writePath, fileName, format, formatTauro, reg) {
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

    let xPosition = 35;
    let textSize = 35;
    const text = fileName;
    const textWidth = helveticaFont.widthOfTextAtSize(text, textSize);

    // Ajout de repères
    if (reg) {
      xPosition = -15;
      firstPage.setSize(longueurPlaque, largeurPlaque);

      const drawRegmarks = (xReg, yReg, sizeReg = 0.6) => {
        firstPage.drawCircle({
          x: xReg,
          y: yReg,
          size: cmToPoints(sizeReg / 2), // Conversion de cm à points pour la taille du cercle
          color: rgb(0, 0, 0),
        });
      };

      // Calcul de la position des repères en points (en utilisant cmToPoints)
      let regSize = cmToPoints(0.3);
      let regPosition = regSize + cmToPoints(1);

      drawRegmarks(-regPosition, height - regPosition);
      drawRegmarks(-regPosition, height - regPosition - cmToPoints(10));
      drawRegmarks(-regPosition, regPosition);
      drawRegmarks(width + regPosition, regPosition);
      drawRegmarks(width + regPosition, height - regPosition);

      firstPage.translateContent((longueurPlaque - width) / 2, (largeurPlaque - height) / 2);
    }

    const getFormat = () => {
      if (wSize === 150 && hSize === 255) {
        xPosition = xPosition;
        textSize = 70;
      }
    };
    getFormat();

    firstPage.drawText(text, {
      x: xPosition,
      y: height / 2 - textWidth / 2,
      size: textSize,
      font: helveticaFont,
      color: rgb(0, 0, 0),
      rotate: degrees(90),
    });

    const pdfBytes = await pdfDoc.save();
    await fs.promises.writeFile(`${writePath}/${text}.pdf`, pdfBytes);
  } catch (error) {
    console.error("Une erreur s'est produite lors de la modification du PDF :", error);
  }
}

module.exports = modifyPdf;
