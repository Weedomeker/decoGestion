const express = require('express')
const modifyPdf = require('./app')
const {pdfToimg, fileExist} = require('./pdfToimg')
const path = require('path')
const fs = require('fs')
const app = express()
const PORT = process.env.PORT || 8000

app.use(express.urlencoded({extended: false}))
app.use(express.static('./public'))

let fileName

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, './public/index.html'))
})

app.post('/', async (req, res) => {

  fileName = path.join(__dirname,`./public/tmp/${req.body.numCmd} - LM ${req.body.ville} - ${req.body.format}_${req.body.visuel}_${req.body.qte} EX(S)`)

  try {
    //Edition pdf
    await modifyPdf( req.body.numCmd, (req.body.ville).toUpperCase(), req.body.format, (req.body.visuel).toUpperCase(), req.body.qte)
    //Redirection
    res.redirect('/download')
  } catch (error) {
    console.log(error)
  }
})

app.get('/download',  async (req, res) => {

 //Genererate img
 try {
  await pdfToimg(`${fileName}.pdf`, `${fileName}.jpg`)
} catch (error) {
  console.log('FAILED GENERATE IMAGE: ', error)
}
!fileExist ? res.sendFile(`${fileName}.jpg`) : res.send('<center><h3>Failed generate image</h3></center>')

})

app.listen(PORT,() => {
console.log(`Server start on port ${PORT}`)
})