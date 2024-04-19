const makerjs = require('makerjs')
const pdfkit = require('pdfkit')
const fs = require('fs')
const path = require('path')
let exportPath = []

const createDec = async (widthPlate = Number, heightPlate = Number, decWidth = Number, decHeight= Number) =>{

  const model = {
    models: {
      plate: {
        models: {
          dec: new makerjs.models.RoundRectangle(decHeight, decWidth, 0),
        },
      },

      regmarks: {
        paths: {
          //BAS
          reg1: new makerjs.paths.Circle([(-decHeight/2)-1.5, (decWidth/2)-1], 0.3),
          reg2: new makerjs.paths.Circle([(-decHeight/2)-1.5, (decWidth/2)-10], 0.3),
          reg3: new makerjs.paths.Circle([(-decHeight/2)-1.5, (-decWidth/2)+1], 0.3),
          //HAUT
          reg4: new makerjs.paths.Circle([(decHeight/2)+1.5, (decWidth/2)-1], 0.3),
          reg5: new makerjs.paths.Circle([(decHeight/2)+1.5,  (-decWidth/2)+1], 0.3),
        }
      },

      wasteCut: {
        paths: {
          //Top
          v1: new makerjs.paths.Line([-decHeight / 3, widthPlate / 2], [-decHeight / 3, decWidth / 2 + 0.6]),
          v2:
            decHeight <= 80
              ? console.log('Plus petit que 800: ', true)
              : new makerjs.paths.Line([0, widthPlate / 2], [0, decWidth / 2 + 0.6]),
          v3: new makerjs.paths.Line([decHeight / 3, widthPlate / 2], [decHeight / 3, decWidth / 2 + 0.6]),
          //Bottom
          v4: new makerjs.paths.Line([-decHeight / 3, -widthPlate / 2], [-decHeight / 3, -decWidth / 2 - 0.6]),
          v5:
            decHeight <= 80
              ? console.log('Plus petit que 800: ', true)
              : new makerjs.paths.Line([0, -widthPlate / 2], [0, -decWidth / 2 - 0.6]),
          v6: new makerjs.paths.Line([decHeight / 3, -widthPlate / 2], [decHeight / 3, -decWidth / 2 - 0.6]),
          //Left
          h1: new makerjs.paths.Line([-heightPlate / 2, 0], [(-decHeight - 0.6) / 2, 0]),
          //Right
          h2: new makerjs.paths.Line([heightPlate / 2, 0], [(decHeight + 0.6) / 2, 0]),
        },
      },
    },
  }
  const result = model.models.plate.models.dec
  makerjs.model.center(result)
  model.models.plate.models.dec.layer = 'red'
  model.models.regmarks.paths.reg1.layer = 'black'
  model.models.regmarks.paths.reg2.layer = 'black'
  model.models.regmarks.paths.reg3.layer = 'black'
  model.models.regmarks.paths.reg4.layer = 'black'
  model.models.regmarks.paths.reg5.layer = 'black'
  model.models.wasteCut.paths.h1.layer = 'maroon'
  model.models.wasteCut.paths.h2.layer = 'maroon'
  model.models.wasteCut.paths.v1.layer = 'maroon'
  model.models.wasteCut.paths.v2.layer = 'maroon'
  model.models.wasteCut.paths.v3.layer = 'maroon'
  model.models.wasteCut.paths.v4.layer = 'maroon'
  model.models.wasteCut.paths.v5.layer = 'maroon'
  model.models.wasteCut.paths.v6.layer = 'maroon'

  try {
    let pathFile = path.join(__dirname, '../public/tmp/')
    let fileName = `${decWidth} x ${decHeight}.dxf`
    const dxf = makerjs.exporter.toDXF(model, { units: 'cm', layerOptions: { dec: { color: 2 } } })
    try {
      if (fs.existsSync(`./public/temp/`)) {
        await fs.writeFileSync(pathFile + fileName,dxf,);
      } else {
        await fs.mkdirSync(`./public/temp/`, { recursive: true });
        await fs.writeFileSync(pathFile + fileName,dxf,);
      }
    } catch (error) {
      console.log(error);
    }
    console.log(pathFile + fileName)
    exportPath.push(fileName)
   
  } catch (err) {
    console.log(err)
  }
}

//createDec(101, 215, 80, 205)
module.exports = createDec