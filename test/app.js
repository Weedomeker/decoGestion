(async function () {
  const path = require('path');
  const createPdf = require('../server/src/app');
  const createCut = require('../server/src/dec');
  // const preview = require('../server/src/preview');
  // filePath, writePath, fileName, format, formatTauro, reg
  // widthPlate = Number, heightPlate = Number, decWidth = Number, decHeight = Number, writePath

  const pathDeco = path.join(__dirname, '../server/public/deco/4_100X210CM/DIBOND 101X215-TEST_JOHN 100x210_S_.pdf');
  const writePath = path.join(__dirname, './');
  const fileName = path.basename(pathDeco, '.pdf');
  const { [0]: wPlate, [1]: hPlate, [2]: wVisu, [3]: hVisu } = fileName.match(/\d+/g);
  const format = wVisu + 'x' + hVisu;
  const formatPlaque = 'Std_' + wPlate + 'x' + hPlate;

  async function generateDeco() {
    createPdf(pathDeco, writePath, fileName, format, formatPlaque, true);
    createCut(wPlate, hPlate, wVisu, hVisu, writePath);
  }
  try {
    await generateDeco();
  } catch (error) {
    console.log(error);
  }
})();
