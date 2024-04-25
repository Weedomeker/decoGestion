const makerjs = require('makerjs');
const fs = require('fs');
const path = require('path');

let exportPath = [];

const createDec = (widthPlate = Number, heightPlate = Number, decWidth = Number, decHeight = Number) => {
  const regSize = 0.3;
  const regPosition = 1.5;

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
          reg1: new makerjs.paths.Circle([-decHeight / 2 - regPosition, decWidth / 2 - regPosition], regSize),
          reg2: new makerjs.paths.Circle([-decHeight / 2 - regPosition, decWidth / 2 - (regPosition + 10)], regSize),
          reg3: new makerjs.paths.Circle([-decHeight / 2 - regPosition, -decWidth / 2 + regPosition], regSize),
          //HAUT
          reg4: new makerjs.paths.Circle([decHeight / 2 + regPosition, decWidth / 2 - regPosition], regSize),
          reg5: new makerjs.paths.Circle([decHeight / 2 + regPosition, -decWidth / 2 + regPosition], regSize),
        },
      },

      wasteCut: {
        paths: {
          //Top
          v1: new makerjs.paths.Line([-decHeight / 3, widthPlate / 2], [-decHeight / 3, decWidth / 2 + 0.6]),
          v2: decHeight <= 80 ? console.log('Plus petit que 80: ', true) : new makerjs.paths.Line([0, widthPlate / 2], [0, decWidth / 2 + 0.6]),
          v3: new makerjs.paths.Line([decHeight / 3, widthPlate / 2], [decHeight / 3, decWidth / 2 + 0.6]),
          //Bottom
          v4: new makerjs.paths.Line([-decHeight / 3, -widthPlate / 2], [-decHeight / 3, -decWidth / 2 - 0.6]),
          v5: decHeight <= 80 ? console.log('Plus petit que 80: ', true) : new makerjs.paths.Line([0, -widthPlate / 2], [0, -decWidth / 2 - 0.6]),
          v6: new makerjs.paths.Line([decHeight / 3, -widthPlate / 2], [decHeight / 3, -decWidth / 2 - 0.6]),
          //Left
          h1: new makerjs.paths.Line([-heightPlate / 2, 0], [(-decHeight - 0.6) / 2, 0]),
          //Right
          h2: new makerjs.paths.Line([heightPlate / 2, 0], [(decHeight + 0.6) / 2, 0]),
        },
      },
    },
  };
  model.models.wasteCut.paths = Wastecut(heightPlate, 80).paths;
  console.log(model.models);
  const result = model.models.plate.models.dec;
  makerjs.model.center(result);
  model.models.plate.models.dec.layer = 'red';
  model.models.regmarks.paths.reg1.layer = 'black';
  model.models.regmarks.paths.reg2.layer = 'black';
  model.models.regmarks.paths.reg3.layer = 'black';
  model.models.regmarks.paths.reg4.layer = 'black';
  model.models.regmarks.paths.reg5.layer = 'black';
  model.models.wasteCut.paths.Top1.layer = 'maroon';
  model.models.wasteCut.paths.Top2.layer = 'maroon';
  model.models.wasteCut.paths.Bottom1.layer = 'maroon';
  model.models.wasteCut.paths.Bottom2.layer = 'maroon';
  model.models.wasteCut.paths.v3.layer = 'maroon';
  model.models.wasteCut.paths.v4.layer = 'maroon';
  model.models.wasteCut.paths.v5.layer = 'maroon';
  model.models.wasteCut.paths.v6.layer = 'maroon';

  try {
    let pathFile = path.join(__dirname, '../public/tmp/');
    let fileName = `${decWidth}x${decHeight}`;
    const dxf = makerjs.exporter.toDXF(model, { units: 'cm', layerOptions: { dec: { color: 2 } } });
    const svg = makerjs.exporter.toSVG(model, { units: 'mm' });
    try {
      if (fs.existsSync(pathFile)) {
        fs.writeFileSync(pathFile + fileName + '.dxf', dxf);
        fs.writeFileSync(pathFile + fileName + '.svg', svg);
      } else {
        fs.mkdirSync(pathFile, { recursive: true });
        fs.writeFileSync(pathFile + fileName + '.dxf', dxf);
        fs.writeFileSync(pathFile + fileName + '.svg', svg);
      }
    } catch (error) {
      console.log(error);
    }
    exportPath.push(fileName);
  } catch (err) {
    console.log(err);
  }
};

// createDec(125, 260, 100, 200);
module.exports = createDec;
