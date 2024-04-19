const { degrees, PDFDocument, rgb, StandardFonts, grayscale } = require('pdf-lib');
const fs = require('fs');
const { performance } = require('perf_hooks');
const {cmToPxl, pxlToCm} = require('./convertPxlCm')


async function modifyPdf(filePath, writePath, fileName, format, formatTauro) {
  const readPdf = await fs.promises.readFile(filePath);
  const pdfDoc = await PDFDocument.load(readPdf);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const wSize = format.split('x')[0];
  const hSize = format.split('x')[1];

  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const { width, height } = firstPage.getSize();
  const fTauro = formatTauro.split('_').pop()
  const largeurPlaque = cmToPxl(parseInt(fTauro.split('x')[0]), 72)
  const longueurPlaque = cmToPxl(parseInt(fTauro.split('x')[1]), 72)
  

  firstPage.setSize(longueurPlaque,  largeurPlaque)


const drawRegmarks = (xReg, yReg) => {
  firstPage.drawCircle({
    x: xReg,
    y: yReg,
    size: cmToPxl(0.3, 72),
    color: rgb(0,0,0),
  })
}
drawRegmarks(- cmToPxl(1, 72), cmToPxl(1, 72))
drawRegmarks(- cmToPxl(1, 72),height- cmToPxl(1, 72))
drawRegmarks(- cmToPxl(1, 72),height- cmToPxl(10, 72))
drawRegmarks(width+ cmToPxl(1, 72),  cmToPxl(1, 72))
drawRegmarks(width+ cmToPxl(1, 72), height- cmToPxl(1, 72))

firstPage.translateContent((longueurPlaque-width)/2 ,(largeurPlaque-height)/2)

console.log('Format visuel: ',pxlToCm(width,72), 'x', pxlToCm(height,72), "cm");
console.log('Format plaque: ', pxlToCm(largeurPlaque, 72), 'x',  pxlToCm(longueurPlaque, 72));


  let xPosition = -25;
  let textSize = 35;
  const getFormat = () => {
    if (hSize == 210) {
      xPosition = xPosition;
      textSize = 70;
    } else if (wSize == 150 && hSize == 255) {
      xPosition = xPosition;
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
