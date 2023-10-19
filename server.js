const appVersion = require('./package.json');
const express = require('express');
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

//Date
let d = new Date();
let hours = d.getHours();
if (hours < 10) {
  hours = '0' + hours;
}
let mins = d.getMinutes();
if (mins < 10) {
  mins = '0' + mins;
}
let secs = d.getSeconds();
let time = hours + ':' + mins + ':' + secs;
//Path déco
const decoFolder = './public/deco';
//Path export pdf
//let saveFolder = './public/tauro';
let saveFolder = './public/tmp';
//Path export jpg
let saveJpg = saveFolder + '/jpg';

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
  writePath,
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
  console.log(`Version: ${appVersion.version}`);
  res.sendFile(path.join(__dirname, './client/dist/index.html'));
});

app.post('/', async (req, res) => {
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
  writePath = saveFolder + '/' + formatTauro;

  //Nom fichier
  fileName = `${data.numCmd} - LM ${data.ville.toUpperCase()} - ${formatTauro.split('_').pop()} - ${visuel.replace(
    /\.[^/.]+$/,
    '',
  )} ${data.ex}_EX`;

  //Verifier si dossiers exist si pas le créer
  if (fs.existsSync(writePath) && fs.existsSync(saveJpg + +'/' + formatTauro)) {
    pdfName = writePath + '/' + fileName;
    jpgName = saveJpg + +'/' + formatTauro + '/' + fileName;
  } else {
    fs.mkdirSync(writePath, { recursive: true });
    fs.mkdirSync(saveJpg + '/' + formatTauro, { recursive: true });
    pdfName = writePath + '/' + fileName;
    jpgName = saveJpg + '/' + formatTauro + '/' + fileName;
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
    console.log(`${time}:`, fileName);
    console.log('Fin de tache:', success);
    fs.appendFileSync('./public/session.log', `${time}: ${fileName}\r`);
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

app.get('/:format', async (req, res) => {
  const format = search(req.params.format);
  if (format === undefined) {
    res.json({ Info: getFiles(decoFolder).map((el) => el.name) });
  } else {
    //console.log(format)
    res.json(format);
  }
});

app.listen(PORT, () => {
  console.log(`Server start on port ${PORT}`);
});
