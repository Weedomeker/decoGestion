const express = require('express')
const cors = require('cors')
const modifyPdf = require('./src/app')
const getFiles = require('./src/getFiles').getData
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

 //const decoPath = (String.raw `\\NASSYNORS1221\agence\1-décokin\DECO-K-IN\01 SALLE DE BAIN\01 REF LEROY MERLIN`)
const decoPath = './public/deco'
const writePath = decoPath + '/temp'
let fileName, filePath


function search(format){
  const data = getFiles(decoPath)
  for (let i=0; i < data.length; i++) {
      if (data[i].name === format) {
          return data[i];
      }
  }
}


app.get('/', (req, res) => {
  if(getFiles(decoPath).length)
  res.render('index', {
    data: getFiles(decoPath),
    pdf: fileName 
  })
})



app.post('/', async (req, res) => {

  // fileName = path.join(__dirname,`./public/tmp/${req.body.numCmd} - LM ${req.body.ville} - ${req.body.format}_${req.body.visuel}_${req.body.qte} EX(S)`)
  fileName = writePath + (`/${req.body.numCmd} - LM ${req.body.ville} - ${req.body.format}_${req.body.visuel}_${req.body.qte} EX(S)`.toUpperCase())
  filePath = (search(req.body.format).path + req.body.visuel)
  console.log(fileName.split('/').slice(2).join('/'))

  try {
    //Edition pdf
    await modifyPdf( filePath, writePath, req.body.numCmd, req.body.ville, req.body.format, req.body.visuel, req.body.qte)
    //Genererate img
 try {
  await pdfToimg(`${fileName}.pdf`, `${fileName}.jpg`)
  if(getFiles(decoPath).length)
  await res.render('index', {
    data: getFiles(decoPath),
    pdf: fileName.split('/').slice(2).join('/') + '.jpg'
  })
} catch (error) {
  console.log('FAILED GENERATE IMAGE: ', error)
}
    //Redirection
  } catch (error) {
    console.log(error)
  }

})



app.get('/path',  async (req, res) => {
  const dirDeco = getFiles(decoPath)
  res.json(dirDeco)
})



app.get('/:format',  async (req, res) => {
  const format = (search(req.params.format))
  if(format === undefined) {
    res.json({Info:
    getFiles(decoPath).map(el => el.name)
    })
  } else {
 //console.log(format)
 res.json(format)
  }
})

app.listen(PORT,() => {
console.log(`Server start on port ${PORT}`)
})