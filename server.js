const express = require('express')
const app = express()
const server = require('http').createServer(app)
const io = require("socket.io")(server)
const cors = require('cors')
const modifyPdf = require('./src/app')
const getFiles = require('./src/getFiles').getData
const {pdfToimg} = require('./src/pdfToimg')
const path = require('path')
const fs = require('fs')
const { performance } = require('perf_hooks');
const PORT = process.env.PORT || 8000

app.set('view engine', 'ejs')
app.use(cors())
app.use(express.urlencoded({extended: false}))
app.use(express.static('./public'))
app.use(express.json())

const decoPath = './public/deco'
const writePath = decoPath + '/temp'
let fileName, filePath, start, timeExec, pdfTime, jpgTime

const progressBar =  async (progress) => {
  await io.sockets.on('connection', (socket) => {
    socket.emit('progress', progress)
  })
}

function search(format){
  const data = getFiles(decoPath)
  for (let i=0; i < data.length; i++) {
      if (data[i].name === format) {
          return data[i];
      }
  }
}


app.get('/', (req, res) => {
progressBar(1)
  if(getFiles(decoPath).length)
  res.render('index', {
    data: getFiles(decoPath),
    pdf: fileName,
    pdfTimer: pdfTime,
    jpgTimer: jpgTime
  })
})


app.post('/', async (req, res) => {
   progressBar(15)
  let visuel = req.body.visuel.split('/').pop()
  fileName = writePath + (`/${req.body.numCmd} - LM ${req.body.ville.toUpperCase()} - ${req.body.format}_${visuel}_${req.body.qte} EX`)
  filePath = req.body.visuel

  //Edition pdf
  start = performance.now()
  progressBar(25)
    await modifyPdf( filePath, writePath, req.body.numCmd, req.body.ville, req.body.format, visuel, req.body.qte)
    progressBar(50)
     timeExec = ((performance.now() - start)/1000).toFixed(2)
    pdfTime = ('PDF Completed in ' + timeExec + ' secs !')
    //Genererate img
 try {

   progressBar(75)
  start = performance.now()
  await pdfToimg(`${fileName}.pdf`, `${fileName}.jpg`)
  timeExec = ((performance.now() - start)/1000).toFixed(2)
  jpgTime = ('JPEG Completed in ' + timeExec + ' secs !')
   progressBar(100)
  if(getFiles(decoPath).length)
  await res.render('index', {
    data: getFiles(decoPath),
    pdf: fileName.split('/').slice(2).join('/') + '.jpg',
    pdfTimer: pdfTime,
    jpgTimer: jpgTime,
  })
} catch (error) {
  console.log('FAILED GENERATE IMAGE: ', error)
  res.send(error)
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

server.listen(PORT,() => {
console.log(`Server start on port ${PORT}`)
})