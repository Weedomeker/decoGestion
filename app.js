const { degrees, PDFDocument, rgb, StandardFonts } = require ('pdf-lib');
const fs = require('fs/promises')
const path = require ('path');

const filePath = path.join(__dirname,'./public/deco/')
async function modifyPdf (numCmd, ville, format, visuel, qte) {
  const readPdf =  await fs.readFile(filePath + '5_100X255CM/125x260/DIBOND 125X260-5Galets 100x255cm-S.pdf')
  const pdfDoc = await PDFDocument.load(readPdf)
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const pages = pdfDoc.getPages()
  const firstPage = pages[0]
  const { width, height } = firstPage.getSize()
  console.log('Format pdf: ', width + 'x' + height)

  const text = `${numCmd} - LM ${ville} - ${format}_${visuel}_${qte} EX(S)`
  const textSize = 30;
  const textWidth = helveticaFont.widthOfTextAtSize(text, textSize);
  //const textHeight = helveticaFont.heightAtSize(textSize);
  firstPage.drawText(text, {
    x: 35,
    y: height / 2 - textWidth / 2,
    size: textSize,
    font: helveticaFont,
    color: rgb(0,0,0),
    rotate: degrees(90)
  })

  const pdfBytes = await pdfDoc.save()

  try {
    await fs.writeFile(path.join(__dirname,`./public/tmp/${numCmd} - LM ${ville} - ${format}_${visuel}_${qte} EX(S).pdf`), pdfBytes)
    console.log('PDF Saved !')
  } catch (error) {
    console.log(error)
  }
}

module.exports = modifyPdf;




