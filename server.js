const express = require('express')
const modifyPdf = require('./src/app')
const explorer = require('./src/explorer')
const search = require('./src/explorer').search
const {pdfToimg, fileExist} = require('./src/pdfToimg')
const path = require('path')
const fs = require('fs')
const app = express()
const PORT = process.env.PORT || 8000

app.set('view engine', 'ejs')
app.use(express.urlencoded({extended: false}))
app.use(express.static('./public'))
app.use(express.json())

let fileName, decoPath, decoFormat, decoFiles

app.get('/', (req, res) => {
  if(explorer.nameObj.length)
  res.render('index', {
    data: explorer.nameObj
  })
  //res.sendFile(path.join(__dirname, './public/index.html'))
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

app.get('/path',  async (req, res) => {
  const dirDeco = explorer.nameObj
  res.json(dirDeco)
})

app.get('/:format',  async (req, res) => {
  const format = (search(req.params.format))
  if(format === undefined) {
    res.send(`<a>Format not found.<br><br>
    ${explorer.nameObj.map(el => `${el.name}<br>`).join('')}
    </a>`)
  } else {
 //console.log(format)
 res.json(format)
  }
})

app.listen(PORT,() => {
console.log(`Server start on port ${PORT}`)
})