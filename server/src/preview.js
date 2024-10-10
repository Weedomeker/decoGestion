const { degrees, PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const { cmToPoints, pointsToCm } = require('./convertUnits').default;

async function preview(svgPath, pdfPath, writePath) {
  try {
    const svgFile = await fs.promises.readFile(svgPath, 'utf8');

    const readPdf = await fs.promises.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(readPdf);
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];

    firstPage.drawSvgPath(svgFile);

    const pdfBytes = await pdfDoc.save();
    await fs.promises.writeFile(`${writePath}/preview.pdf`, pdfBytes);
  } catch (error) {
    console.log(error);
  }
}

preview(
  path.join(__dirname, '../../test/100x210.svg'),
  path.join(__dirname, '../../test/test.pdf'),
  path.join(__dirname, '../../test'),
);

// module.exports = preview;
