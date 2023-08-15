const express = require('express')
const modifyPdf = require('./app')
const path = require('path')
const { pdftobuffer } = require('pdftopic')
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

app.get('/download',  (req, res) => {
res.download(`${fileName}.pdf`, (err) => {
  if(err) {
    console.log('Download error: ',err)
    res.redirect('/')
  }
})
 //Generer un png
 try {
  const pdfToImg =  fs.readFileSync(`${fileName}.pdf`, null)
 pdftobuffer(pdfToImg, 0).then((buffer) => {
  fs.writeFileSync(`${fileName}.png`, buffer, null)
})
} catch (error) {
  console.log(error)
}
})

app.listen(PORT,() => {
console.log(`Server start on port ${PORT}`)
})