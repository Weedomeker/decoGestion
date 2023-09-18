const express = require('express')
const app = express()
const cookieSession = require('cookie-session')
const cors = require('cors')
const modifyPdf = require('./src/app')
const getFiles = require('./src/getFiles').getData
const {pdfToimg} = require('./src/pdfToimg')
const path = require('path')
const fs = require('fs')
const { performance } = require('perf_hooks');
const PORT = process.env.PORT || 8000

app.use(cors())
app.use(express.urlencoded({extended: false}))
app.use('/public' , express.static(path.join(__dirname, './public')))
app.use(express.static(path.join(__dirname, './client/dist')))
app.use(express.json())
app.set('trust proxy', 1) // trust first proxy

app.use(cookieSession({
  name: 'session',
  keys: [''],
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
}))

let pdfName = '', jpgName = '',start, timeExec, pdfTime, jpgTime, format, session, writePath

//Path déco
const decoFolder = './public/deco'
//Path export pdf
let saveFolder = './public/deco/temp/'
//Path export jpg
let saveJpg = saveFolder + '/jpg'

//Sous dossiers par formats
function formatPath() {
  switch (format) {
    case "100x200":
      writePath = saveFolder + session +'/1_DIBOND 100x200'
      break;

      case "100x210" || "120x240" || "100x255":
        writePath = saveFolder + session +'/2_DIBOND 125x260'
        break;

        case "150x255" || "150x300":
          writePath = saveFolder + session +'/3_DIBOND 150x305'
          break;
  
    default:
      writePath = saveFolder + session +'/autres'
      break;
  }
}

function search(format){
  const data = getFiles(decoFolder)
  for (let i=0; i < data.length; i++) {
      if (data[i].name === format) {
          return data[i];
      }
  }
}


app.get('/', (req, res) => {

  res.sendFile(path.join(__dirname, './client/dist/index.html'))
  res.end(req.session.sessionDeco = session)
})


app.post('/', async (req, res) => {
  const data = {
    session: req.body.session.toUpperCase(),
    format: req.body.format,
    visuel: req.body.visuel,
    numCmd: req.body.numCmd,
    ville: req.body.ville.toUpperCase(),
    ex: req.body.ex
  }
  let visuel = data.visuel.split('/').pop()
  visuPath = data.visuel
  format = data.format
  session = data.session
console.log(req.session)
  

  //formatPath()

  //Verifier si dossiers exist si pas le créer
  // if(fs.existsSync(writePath) && fs.existsSync(saveJpg)) {
  //   pdfName = writePath + (`/${data.numCmd} - LM ${data.ville.toUpperCase()} - ${data.format}_${visuel}_${data.ex} EX`)
  //   jpgName = saveJpg + (`/${data.numCmd} - LM ${data.ville.toUpperCase()} - ${data.format}_${visuel}_${data.ex} EX`)
  // } else {
  //   await fs.mkdirSync(writePath, {recursive: true})
  //   await fs.mkdirSync(saveJpg, {recursive: true})
  //   pdfName = writePath + (`/${data.numCmd} - LM ${data.ville.toUpperCase()} - ${data.format}_${visuel}_${data.ex} EX`)
  //   jpgName = saveJpg + (`/${data.numCmd} - LM ${data.ville.toUpperCase()} - ${data.format}_${visuel}_${data.ex} EX`)
  // }
  
  
//   //Edition pdf
//   start = performance.now()
//     await modifyPdf( visuPath, writePath, data.numCmd, data.ville, data.format, visuel, data.ex)
//      timeExec = ((performance.now() - start)/1000).toFixed(2)
//      pdfTime = ('PDF Completed in ' + timeExec + ' secs !')


//     //Genererate img
//  try {
//   start = performance.now()
//   await pdfToimg(`${pdfName}.pdf`, `${jpgName}.jpg`)
//   timeExec = ((performance.now() - start)/1000).toFixed(2)
//   jpgTime = ('JPEG Completed in ' + timeExec + ' secs !')
//   //if(getFiles(decoFolder).length)
//   res.status(200).send({msg:'Success !'})
// } catch (error) {
//   console.log('FAILED GENERATE IMAGE: ', error)
//   res.send(error)
// }
  })


  app.get('/public',  async (req, res) => {
    res.status(200).send()
  })

  app.get('/path',  async (req, res) => {
    const dirDeco = getFiles(decoFolder)
    res.json(dirDeco)
  })

app.get('/:format',  async (req, res) => {
  const format = (search(req.params.format))
  if(format === undefined) {
    res.json({Info:
    getFiles(decoFolder).map(el => el.name)
    })
  } else {
 //console.log(format)
 res.json(format)
  }
})

app.listen(PORT,() => {
console.log(`Server start on port ${PORT}`)
})