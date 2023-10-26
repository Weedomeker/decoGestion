const appVersion = require('./package.json');
const express = require('express');
const XLSX = require('xlsx');
const { stringify } = require('csv-stringify');
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
const decoFolder = './public/deco';
//Path export pdf
//let saveFolder = './public/tauro';
let saveFolder = './public/tmp';
let jpgPath = saveFolder;
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
  formatTauro,
  success = false;

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
  success = false;

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

  //Verfi success process
  success ? (success = false) : success;
  console.log('Process status reset: ', success, '🔄');
  const data = {
    formatTauro: req.body.formatTauro,
    visuel: req.body.visuel,
    numCmd: req.body.numCmd,
    ville: req.body.ville.toUpperCase(),
    ex: req.body.ex,
  };
  let visuel = data.visuel.split('/').pop();
  visuel = data.visuel.split('-').pop();
  visuPath = data.visuel;
  formatTauro = data.formatTauro;

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
  await modifyPdf(visuPath, writePath, fileName);
  timeExec = ((((performance.now() - start) % 360000) % 60000) / 1000).toFixed(2);
  pdfTime = timeExec;
  console.log(`Pdf: ✔️`);

  //Genererate img
  try {
    start = performance.now();
    await pdfToimg(`${pdfName}.pdf`, `${jpgName}.jpg`);
    timeExec = ((((performance.now() - start) % 360000) % 60000) / 1000).toFixed(2);
    jpgTime = timeExec;
    console.log(`Jpg: ✔️`);

    if (getFiles(decoFolder).length) success = true;
    console.log(`${date} ${time}:`, fileName);
    console.log('Fin de tache:', success);

    //Fichier log csv etc.
    const csvFile = [
      {
        date: date,
        heure: time,
        numCmd: fileName.split(' - ').shift(),
        mag: fileName.split(' - ').slice(1).shift(),
        dibond: fileName.split(' - ').slice(2).shift(),
        deco: fileName.split(' - ').slice(2).pop(),
      },
    ];
    //XLSX create file
    if (fs.existsSync('./public/session.xlsx')) {
      const wb = XLSX.readFile('./public/session.xlsx', { cellStyles: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      XLSX.utils.sheet_add_json(ws, csvFile, { origin: -1, skipHeader: true });
      XLSX.writeFile(wb, './public/session.xlsx', { cellStyles: true });
    } else {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(csvFile);
      XLSX.utils.book_append_sheet(wb, ws, 'session');
      XLSX.writeFile(wb, './public/session.xlsx');
    }

    res.status(200).send({ msg: 'Success' });
  } catch (error) {
    console.log('FAILED GENERATE IMAGE: ', error);
    res.send(error);
  }
});

app.get('/process', async (req, res) => {
  res.json({
    jpgTime: parseFloat(jpgTime),
    pdfTime: parseFloat(pdfTime),
    jpgPath: jpgName.split('/').slice(2).join('/') + '.jpg',
    version: appVersion.version,
    success: success,
  });
});

app.get('/public', async (req, res) => {
  res.status(200).send();
});

app.get('/path', async (req, res) => {
  success = false;
  console.log('Etat du process: ', success);
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
  console.log(`Server start on port ${PORT}`);
});
