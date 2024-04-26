const makerjs = require('makerjs');
const fs = require('fs');
const path = require('path');
const Wastecut = require('./wastecut');
let exportPath = [];

const createDec = (
  widthPlate = Number,
  heightPlate = Number,
  decWidth = Number,
  decHeight = Number,
) => {
  const regSize = 0.3;
  const regPosition = 1.5;

  const model = {
    models: {
      plate: {
        models: {
          dec: new makerjs.models.RoundRectangle(decHeight, decWidth, 0),
          dec2: new makerjs.models.RoundRectangle(heightPlate, widthPlate, 0),
        },
      },

      regmarks: {
        paths: {
          //BAS
          reg1: new makerjs.paths.Circle(
            [-decHeight / 2 - regPosition, decWidth / 2 - regPosition],
            regSize,
          ),
          reg2: new makerjs.paths.Circle(
            [-decHeight / 2 - regPosition, decWidth / 2 - (regPosition + 10)],
            regSize,
          ),
          reg3: new makerjs.paths.Circle(
            [-decHeight / 2 - regPosition, -decWidth / 2 + regPosition],
            regSize,
          ),
          //HAUT
          reg4: new makerjs.paths.Circle(
            [decHeight / 2 + regPosition, decWidth / 2 - regPosition],
            regSize,
          ),
          reg5: new makerjs.paths.Circle(
            [decHeight / 2 + regPosition, -decWidth / 2 + regPosition],
            regSize,
          ),
        },
      },

      wasteCut: {
        paths: {
          // //Top
          // v1: new makerjs.paths.Line([-decHeight / 3, widthPlate / 2], [-decHeight / 3, decWidth / 2 + 0.6]),
          // v2: decHeight <= 80 ? console.log('Plus petit que 80: ', true) : new makerjs.paths.Line([0, widthPlate / 2], [0, decWidth / 2 + 0.6]),
          // v3: new makerjs.paths.Line([decHeight / 3, widthPlate / 2], [decHeight / 3, decWidth / 2 + 0.6]),
          // //Bottom
          // v4: new makerjs.paths.Line([-decHeight / 3, -widthPlate / 2], [-decHeight / 3, -decWidth / 2 - 0.6]),
          // v5: decHeight <= 80 ? console.log('Plus petit que 80: ', true) : new makerjs.paths.Line([0, -widthPlate / 2], [0, -decWidth / 2 - 0.6]),
          // v6: new makerjs.paths.Line([decHeight / 3, -widthPlate / 2], [decHeight / 3, -decWidth / 2 - 0.6]),
          // //Left
          // h1: new makerjs.paths.Line([-heightPlate / 2, 0], [(-decHeight - 0.6) / 2, 0]),
          // //Right
          // h2: new makerjs.paths.Line([heightPlate / 2, 0], [(decHeight + 0.6) / 2, 0]),
        },
      },
    },
  };

  const dec = model.models.plate.models.dec;
  const result = model.models.plate.models.dec2;
  makerjs.model.center(dec);
  makerjs.model.center(result);
  const waste = Wastecut(widthPlate, heightPlate, decWidth, decHeight).paths;
  model.models.wasteCut.paths = waste;

  model.models.plate.models.dec.layer = 'red';
  model.models.regmarks.paths.reg1.layer = 'black';
  model.models.regmarks.paths.reg2.layer = 'black';
  model.models.regmarks.paths.reg3.layer = 'black';
  model.models.regmarks.paths.reg4.layer = 'black';
  model.models.regmarks.paths.reg5.layer = 'black';

  // const { layers } = Wastecut(widthPlate, heightPlate, decWidth, decHeight);
  // layers.map((v) => {
  //   console.log(v);
  //   return v;
  // });

  // const { paths } = Wastecut(widthPlate, heightPlate, decWidth, decHeight);
  // Object.keys(paths).map((el) => {
  //   model.models.wasteCut.${el}.layer = 'maroon'
  // });

  try {
    let pathFile = path.join(__dirname, '../public/tmp/');
    let fileName = `${decWidth}x${decHeight}`;
    const dxf = makerjs.exporter.toDXF(model, {
      units: 'cm',
      layerOptions: { dec: { color: 2 } },
    });
    const svg = makerjs.exporter.toSVG(model, { units: 'px' });
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

createDec(125, 260, 100, 200);
// module.exports = createDec;
