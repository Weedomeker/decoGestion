const express = require('express')
const cors = require('cors')
const modifyPdf = require('./src/app')
const explorer = require('./src/explorer')
const search = require('./src/explorer').search
const {pdfToimg, fileExist} = require('./src/pdfToimg')
const path = require('path')
const fs = require('fs')
const app = express()
const PORT = process.env.PORT || 8000
app.set('view engine', 'ejs')
app.use(cors())
app.use(express.urlencoded({extended: false}))
app.use(express.static('./public'))
app.use(express.json())

let fileName, filePath

app.get('/', (req, res) => {
  if(explorer.nameObj.length)
  res.render('index', {
    data: explorer.nameObj
  })
  //res.sendFile(path.join(__dirname, './public/index.html'))
})



app.post('/', async (req, res) => {

  // fileName = path.join(__dirname,`./public/tmp/${req.body.numCmd} - LM ${req.body.ville} - ${req.body.format}_${req.body.visuel}_${req.body.qte} EX(S)`)
  fileName = path.join(__dirname, `./public/deco/temp/${req.body.numCmd} - LM ${req.body.ville} - ${req.body.format}_${req.body.visuel}_${req.body.qte} EX(S)`)

filePath = (search(req.body.format).path + req.body.visuel)
  try {
    //Edition pdf
    await modifyPdf( filePath, req.body.numCmd, (req.body.ville).toUpperCase(), req.body.format, (req.body.visuel).toUpperCase(), req.body.qte)
    //Genererate img
 try {
  await pdfToimg(`${fileName}.pdf`, `${fileName}.jpg`)
  res.redirect('/')
} catch (error) {
  console.log('FAILED GENERATE IMAGE: ', error)
}
    //Redirection
  } catch (error) {
    console.log(error)
  }
})



app.get('/path',  async (req, res) => {
  const dirDeco = explorer.nameObj
  res.json(dirDeco)
})



app.get('/:format',  async (req, res) => {
  const format = (search(req.params.format))
  if(format === undefined) {
    res.json({Info:
    explorer.nameObj.map(el => el.name)
    })
  } else {
 //console.log(format)
 res.json(format)
  }
})

app.listen(PORT,() => {
console.log(`Server start on port ${PORT}`)
})