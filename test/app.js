const path = require('path');
const createPdf = require('../server/src/app');
const createCut = require('../server/src/dec');
// filePath, writePath, fileName, format, formatTauro, reg
// widthPlate = Number, heightPlate = Number, decWidth = Number, decHeight = Number, writePath
(async function () {
  createPdf(
    path.join(__dirname, '../server/public/deco/1_100X200CM/DIBOND 100X205-TEST_JOHN 100x200_73800993_S_.pdf'),
    path.join(__dirname, './'),
    'test_100x200',
    '100x200',
    'Std_101x215',
    true,
  );
  createCut(101, 215, 100, 200, path.join(__dirname, './'));
})();
