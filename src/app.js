const { degrees, PDFDocument, rgb, StandardFonts } = require ('pdf-lib');
const fs = require('fs/promises')
const path = require ('path');
const filePath = path.join(__dirname,'../public/deco/')

async function modifyPdf (numCmd, ville, format, visuel, qte) {
  const readPdf =  await fs.readFile(filePath + '2_100X200CM/100x205/DIBOND 100X205-5Galets 100x200_S_.pdf')
  const pdfDoc = await PDFDocument.load(readPdf)
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const pages = pdfDoc.getPages()
  const firstPage = pages[0]
  const { width, height } = firstPage.getSize()
  const text = `${numCmd} - LM ${ville} - ${format}_${visuel}_${qte} EX(S)`;
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
    await fs.writeFile(path.join(__dirname,`../public/tmp/${numCmd} - LM ${ville} - ${format}_${visuel}_${qte} EX(S).pdf`), pdfBytes)
    console.log('PDF Saved !')
  } catch (error) {
    console.log(error)
  }
}

module.exports = modifyPdf;




