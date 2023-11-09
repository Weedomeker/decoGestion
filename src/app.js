const { degrees, PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const { performance } = require('perf_hooks');

async function modifyPdf(filePath, writePath, fileName, format) {
  const readPdf = await fs.promises.readFile(filePath);
  const pdfDoc = await PDFDocument.load(readPdf);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const { width, height } = firstPage.getSize();

  let xPosition = 35;
  let textSize = 35;
  const getFormat = () => {
    const wSize = format.split('x')[0];
    const hSize = format.split('x')[1];
    if (hSize == 210) {
      xPosition = 500;
      textSize = 70;
    } else if (wSize == 150 && hSize == 255) {
      xPosition = 650;
      textSize = 70;
    } else {
      return;
    }
  };
  getFormat();

  const text = fileName;
  const textWitdth = helveticaFont.widthOfTextAtSize(text, textSize);
  firstPage.drawText(text, {
    x: xPosition,
    y: height / 2 - textWitdth / 2,
    size: textSize,
    font: helveticaFont,
    color: rgb(0, 0, 0),
    rotate: degrees(90),
  });

  const pdfBytes = await pdfDoc.save();

  try {
    await fs.promises.writeFile(`${writePath}/${text}.pdf`, pdfBytes);
  } catch (error) {
    console.log(error);
  }
}

module.exports = modifyPdf;
