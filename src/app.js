const { degrees, PDFDocument, rgb, StandardFonts } = require ('pdf-lib');
const fs = require('fs/promises')
const path = require ('path');

async function modifyPdf (filePath, writePath, numCmd, ville, format, visuel, qte) {
  const readPdf =  await fs.readFile(filePath)
  const pdfDoc = await PDFDocument.load(readPdf)
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const pages = pdfDoc.getPages()
  const firstPage = pages[0]
  const { width, height } = firstPage.getSize()
  const text = (`${numCmd} - LM ${ville.toUpperCase()} - ${format}_${visuel.toUpperCase()}_${qte} EX`);
  const textSize = 35;
  const textWitdth = helveticaFont.widthOfTextAtSize(text, textSize)
  firstPage.drawText(text, {
    x: 35,
    y: height / 2 - textWitdth / 2,
    size: textSize,
    font: helveticaFont,
    color: rgb(0,0,0),
    rotate: degrees(90)
  })

  const pdfBytes = await pdfDoc.save()

  try {
    await fs.writeFile((`${writePath}/${text}.pdf`), pdfBytes)
  } catch (error) {
    console.log(error)
  }

}

module.exports = modifyPdf;




