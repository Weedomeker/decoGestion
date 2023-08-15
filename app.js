const { degrees, PDFDocument, rgb, StandardFonts } = require ('pdf-lib');
const fs = require('fs/promises')
const path = require ('path');

const filePath = path.join(__dirname,'./test/')
const decoPath = path.join(__dirname,'C:/\Users/\ESKO/\Desktop/\JOE/\Deco k in/')
console.log(decoPath)
async function modifyPdf (numCmd, ville, format, visuel, qte) {
  const readPdf =  await fs.readFile(filePath + 'test.pdf')
  const pdfDoc = await PDFDocument.load(readPdf)
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const pages = pdfDoc.getPages()
  const firstPage = pages[0]
  const { width, height } = firstPage.getSize()
  firstPage.drawText(`${numCmd} - LM ${ville} - ${format}_${visuel}_${qte} EX(S)`, {
    x: 35,
    y: height / 2,
    size: 30,
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




