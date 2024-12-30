const { degrees, PDFDocument, rgb, StandardFonts } = require('pdf-lib');
require('dotenv').config();
const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || 8000;
const fs = require('fs');
const { cmToPoints, pointsToCm, cmToPxl } = require('./convertUnits');
const generateQRCode = require('./qrcode');

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

    firstPage.drawText(text, {
      x: xPosition,
      y: height / 2 - textWidth / 2,
      size: textSize,
      font: helveticaFont,
      color: rgb(0, 0, 0),
      rotate: degrees(90),
    });
    const newDate = new Date(data.date).toLocaleString('fr-FR', { timeZone: 'EUROPE/PARIS' });
    const dayDate = new Date()
      .toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
      .replace('.', '')
      .toLocaleUpperCase();
    try {
      const newData = {
        Date: newDate,
        cmd: data.cmd,
        ville: data.ville,
        visuel: data.visuel,
        ref: data.ref,
        ex: data.ex,
      };
      const pathQRCodes = `./server/public/PRINTSA#${dayDate}/QRCodes/`;
      if (!fs.existsSync(pathQRCodes)) {
        fs.mkdirSync(pathQRCodes, { recursive: true });
      }

      const url = `http://${HOST}:${PORT}/api/commandes/`;
      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.error(`Response status: ${response.status}`);
        }
        await generateQRCode(url + `?cmd=${data.cmd}&ref=${data.ref}`, pathQRCodes + `QRCode_${fileName}.png`, {
          scale: 1,
          margin: 1,
          color: { dark: '#060075' },
        });
      } catch (error) {
        console.error(error.message);
      }

      const pngURL = `http://localhost:8000/qrcode/QRCode_${fileName}.png`;
      const pngImageBytes = await fetch(pngURL).then((res) => res.arrayBuffer());
      const pngImage = await pdfDoc.embedPng(pngImageBytes);

      firstPage.drawImage(pngImage, {
        x: 0,
        y: 0,
      });
    } catch (error) {
      console.error(error);
    }

    const pdfBytes = await pdfDoc.save();
    await fs.promises.writeFile(`${writePath}/${text}.pdf`, pdfBytes);
  } catch (error) {
    console.error("Une erreur s'est produite lors de la modification du PDF :", error);
  }
}

module.exports = modifyPdf;
