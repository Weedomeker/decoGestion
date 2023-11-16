const isDev = require('isdev');
const checkVersion = require('./src/checkVersion');
const version = require('./package.json');
const express = require('express');
const XLSX = require('xlsx');
const app = express();
const serveIndex = require('serve-index');
const cors = require('cors');
const modifyPdf = require('./src/app');
const getFiles = require('./src/getFiles').getData;
const { pdfToimg } = require('./src/pdfToimg');
const path = require('path');
const fs = require('fs');
const { performance } = require('perf_hooks');
const PORT = process.env.PORT || 8000;

//Path déco
const decoFolder = './public/deco/1_FORMATS STANDARDS';

//Path export
const saveFolder = isDev ? './public/tmp' : './public/tauro';
const jpgPath = saveFolder;

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use('/public', express.static(path.join(__dirname, './public')));
app.use(express.static(path.join(__dirname, './client/dist')));
app.use(
  '/louis',
  express.static(saveFolder),
  serveIndex(saveFolder, { icons: true, stylesheet: './public/style.css' }),
);
app.use(express.json());

let fileName = '',
  pdfName = '',
  jpgName = '',
  start,
  timeExec,
  pdfTime,
  jpgTime,
  format,
  formatTauro;

//Sous dossiers par formats

function search(format) {
  const data = getFiles(decoFolder);
  for (let i = 0; i < data.length; i++) {
    if (data[i].name === format) {
      return data[i];
    }
  }
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, './client/dist/index.html'));
});

app.post('/', async (req, res) => {
  //Date
  let time = new Date().toLocaleTimeString('fr-FR');

  let date = new Date()
    .toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
    .replace('.', '')
    .toLocaleUpperCase();

  const data = {
    allFormatTauro: req.body.allFormatTauro,
    formatTauro: req.body.formatTauro,
    format: req.body.format,
    visuel: req.body.visuel,
    numCmd: req.body.numCmd,
    ville: req.body.ville.toUpperCase(),
    ex: req.body.ex,
    perte: req.body.perte,
  };
  let visuel = data.visuel.split('/').pop();
  visuel = data.visuel.split('-').pop();
  let visuPath = data.visuel;
  let formatTauro = data.formatTauro;
  let allFormatTauro = data.allFormatTauro;
  let format = data.format;

  //Lecture Ecriture format tauro
  let arr = [];
  if (fs.existsSync('./formatsTauro.conf')) {
    const readFile = fs.readFileSync('./formatsTauro.conf', { encoding: 'utf8' });
    arr.push(readFile.split(/\r?\n/g));
    if (allFormatTauro.length > arr[0].length) {
      fs.writeFileSync('./formatsTauro.conf', allFormatTauro.join('\n'));
    }
  }
  //Chemin sortie fichiers
  let writePath = saveFolder + '/' + formatTauro;

  //Nom fichier
  fileName = `${data.numCmd} - LM ${data.ville.toUpperCase()} - ${formatTauro.split('_').pop()} - ${visuel.replace(
    /\.[^/.]+$/,
    '',
  )} ${data.ex}_EX`;

  //Verifier si dossiers exist si pas le créer
  if (fs.existsSync(writePath) && fs.existsSync(`${jpgPath}/PRINTSA#${date}`)) {
    pdfName = writePath + '/' + fileName;
    jpgName = `${jpgPath}/PRINTSA#${date}` + '/' + fileName;
  } else {
    fs.mkdirSync(writePath, { recursive: true });
    fs.mkdirSync(`${jpgPath}/PRINTSA#${date}`, { recursive: true });
    pdfName = writePath + '/' + fileName;
    jpgName = `${jpgPath}/PRINTSA#${date}` + '/' + fileName;
  }

  //Edition pdf
  start = performance.now();
  await modifyPdf(visuPath, writePath, fileName, format);
  timeExec = parseFloat(((((performance.now() - start) % 360000) % 60000) / 1000).toFixed(2));
  pdfTime = timeExec;
  console.log(`Pdf: ✔️`);

  //Genererate img
  try {
    start = performance.now();
    await pdfToimg(`${pdfName}.pdf`, `${jpgName}.jpg`);
    timeExec = parseFloat(((((performance.now() - start) % 360000) % 60000) / 1000).toFixed(2));
    jpgTime = timeExec;
    console.log(`Jpg: ✔️`);

    console.log(`${date} ${time}:`, fileName);

    const dataFileExport = [
      {
        Date: date,
        Heure: time,
        numCmd: parseFloat(fileName.split(' - ')[0]),
        Mag: fileName.split(' - ')[1],
        Dibond: fileName.split(' - ')[2],
        Deco: fileName.split(' - ').slice(2).pop(),
        Temps: parseFloat((jpgTime + pdfTime).toFixed(2)),
        Perte_m2: data.perte,
        app_version: `v${version.version}`,
        ip: req.hostname,
      },
    ];
    //XLSX create file
    if (fs.existsSync('./public/session.xlsx')) {
      const wb = XLSX.readFile('./public/session.xlsx', { cellStyles: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      XLSX.utils.sheet_add_json(ws, dataFileExport, { origin: -1, skipHeader: true });
      XLSX.writeFile(wb, './public/session.xlsx', { cellStyles: true });
    } else {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(dataFileExport);
      XLSX.utils.book_append_sheet(wb, ws, 'session');
      XLSX.writeFile(wb, './public/session.xlsx');
    }

    res.status(200).send();
  } catch (error) {
    console.log('FAILED GENERATE IMAGE: ', error);
    res.send(error);
  }
});

app.get('/process', async (req, res) => {
  let time = new Date().toLocaleTimeString('fr-FR');
  const version = await checkVersion().then((res) => res.message);

  res.status(200).json({
    jpgTime: parseFloat(jpgTime),
    pdfTime: parseFloat(pdfTime),
    jpgPath: jpgName.split('/').slice(2).join('/') + '.jpg',
    fileName: fileName,
    time: time,
    version: version,
  });
});

app.get('/public', async (req, res) => {
  res.status(200).send();
});

app.get('/path', async (req, res) => {
  const dirDeco = getFiles(decoFolder);
  res.json(dirDeco);
});

app.get('/formatsTauro', (req, res) => {
  let arr = [];
  if (fs.existsSync('./formatsTauro.conf')) {
    const readFile = fs.readFileSync('./formatsTauro.conf', { encoding: 'utf8' });
    arr.push(readFile.split(/\r?\n/g));

    const json = arr[0].map((v, i) => ({
      id: i,
      value: v,
    }));
    res.json(json);
  } else {
    fs.writeFileSync('./formatsTauro.conf', '');
  }
});

app.listen(PORT, () => {
  checkVersion()
    .then((result) => {
      console.log(result.message);
    })
    .catch((error) => {
      console.error('Error:', error);
    });
  console.log(`Server start on port ${PORT}`);
});
