(async function () {
  const path = require('path');
  const fs = require('fs');
  const chalk = require('chalk');

  const createPdf = require('../server/src/app');
  const createCut = require('../server/src/dec');
  const preview = require('./preview');

  // filePath, writePath, fileName, format, formatTauro, reg
  // widthPlate = Number, heightPlate = Number, decWidth = Number, decHeight = Number, writePath

  const arrDeco = [
    path.join(__dirname, './visu/DIBOND 101X215-TEST_JOHN 100x200.pdf'),
    path.join(__dirname, '../server/public/deco/3_100X210CM/DIBOND 101x215-TEST_JOHN 100x210_82822321_S_.pdf'),
    path.join(__dirname, '../server/public/deco/2_120X240CM/DIBOND 125X250-TEST_JOHN 120x240_73800986_S.pdf'),
    path.join(__dirname, '../server/public/deco/4_100X255CM/DIBOND 125X260-TEST_JOHN 100x255_82822322_S.pdf'),
    path.join(__dirname, '../server/public/deco/6_150X300CM/DIBOND 150x305-TEST_JOHN 150x300_82822330_S_.pdf'),
  ];

  //const pathDeco = path.join(__dirname, '../server/public/deco/4_100X210CM/DIBOND 101X215-TEST_JOHN 100x210_S_.pdf');

  arrDeco.forEach((pathDeco) => {
    let fileName;
    const writePath = path.join(__dirname, './');
    fileName = path.basename(pathDeco, '.pdf');
    let { [0]: wPlate, [1]: hPlate, [2]: wVisu, [3]: hVisu } = fileName.match(/\d+/g);
    const format = wVisu + 'x' + hVisu;
    let formatPlaque;
    if (fileName.match(/\d+/g)[1] === '205') {
      formatPlaque = 'Std_' + 101 + 'x' + 215;
      wPlate = '101';
      hPlate = '215';
      fileName = fileName.replace('100X205', '101X215');
    } else {
      formatPlaque = 'Std_' + wPlate + 'x' + hPlate;
    }
    (async function () {
      try {
        await createPdf(pathDeco, writePath, fileName, format, formatPlaque, true);
        await createCut(parseFloat(wPlate), parseFloat(hPlate), parseFloat(wVisu), parseFloat(hVisu), writePath);
        const svgFile = await fs.promises.readFile(path.join(__dirname, './', format + '.svg'), { encoding: 'utf8' });
        await preview(
          path.join(writePath, fileName + '.pdf'),
          svgFile,
          path.join(__dirname, './previews', 'preview_' + fileName + '.pdf'),
        );
        console.log('✔️ ', chalk.blue(fileName));
        console.log(chalk.red('---------------------------------'));
      } catch (error) {
        console.log(error);
      }
    })();
  });
})();
