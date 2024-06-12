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
// const { pdfToimg } = require('./src/pdfToimg');
const createDec = require('./src/dec');
const createJob = require('./src/jobsList');
const path = require('path');
const fs = require('fs');
const { performance } = require('perf_hooks');
const { Worker, workerData } = require('worker_threads');
const PORT = process.env.PORT || 8000;

//Path déco
const decoFolder = './public/deco/';

//Path export
const saveFolder = isDev ? './public/tmp' : './public/tauro';
const jpgPath = saveFolder;

app.use(cors());

app.use(express.urlencoded({ extended: false }));
app.use('/public', express.static(path.join(__dirname, './public')));
app.use('/download', express.static(path.join(__dirname, './public/tmp')));
app.use(express.static(path.join(__dirname, './client/dist')));
app.use(
  '/louis',
  express.static(saveFolder),
  serveIndex(saveFolder, { icons: true, stylesheet: './public/style.css' }),
);

app.use(express.json());

let fileName = '',
  writePath = '',
  pdfName = '',
  jpgName = '',
  start,
  timeExec,
  pdfTime,
  jpgTime,
  fileDownload;

let jobList = {
  jobs: [],
  completed: [],
};

function _useWorker(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./src/pdfToimg.js', { workerData: data });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, './client/dist/index.html'));
});

app.post('/delete_job_completed', (req, res) => {
  const clearJobs = req.body.clear;

  if (!clearJobs) {
    return res.status(400).json({ error: 'No jobs ' });
  }
  // Supprimer l'élément du tableau
  jobList.completed = [];
  return res.sendStatus(200); // Renvoie un statut de succès
});

app.post('/run_jobs', async (req, res) => {
  const status = req.body.run;
  if (!status) {
    return res.status(400).json({ error: 'Jobs not run' });
  }

  try {
    for (const job of jobList.jobs) {
      // Date
      let time = new Date().toLocaleTimeString('fr-FR');
      let date = new Date()
        .toLocaleDateString('fr-FR', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
        .replace('.', '')
        .toLocaleUpperCase();
      // Nom fichier
      const fileName = `${job.cmd} - LM ${job.ville.toUpperCase()} - ${job.format_Plaque
        .split('_')
        .pop()} - ${job.visuel.replace(/\.[^/.]+$/, '')} ${job.ex}_EX`;

      // Vérifier si dossiers existent, sinon les créer
      const jobWritePathExists = fs.existsSync(job.writePath);
      const jpgPathExists = fs.existsSync(`${jpgPath}/PRINTSA#${date}`);
      if (!jobWritePathExists) {
        fs.mkdirSync(job.writePath, { recursive: true });
      }
      if (!jpgPathExists) {
        fs.mkdirSync(`${jpgPath}/PRINTSA#${date}`, { recursive: true });
      }
      const pdfName = `${job.writePath}/${fileName}`;
      const jpgName = `${jpgPath}/PRINTSA#${date}/${fileName}`;

      try {
        // Edition pdf
        let startPdf = performance.now();
        await modifyPdf(job.visuPath, job.writePath, fileName, job.format_visu, job.format_Plaque, job.reg);
        let endPdf = performance.now();
        let pdfTime = endPdf - startPdf;
        console.log(
          `✔️ ${date} ${time}:`,
          `${fileName}.pdf (${pdfTime < 1000 ? pdfTime.toFixed(2) + 'ms' : (pdfTime / 1000).toFixed(2) + 's'})`,
        );
      } catch (error) {
        console.error(`Error modifying PDF for job ${job.cmd}:`, error);
      }

      try {
        // Générer image
        let startJpg = performance.now();
        await _useWorker({ pdf: `${pdfName}.pdf`, jpg: `${jpgName}.jpg` });
        let endJpg = performance.now();
        let jpgTime = endJpg - startJpg;
        console.log(
          `✔️ ${date} ${time}:`,
          `${fileName}.jpg (${jpgTime < 1000 ? jpgTime.toFixed(2) + 'ms' : (jpgTime / 1000).toFixed(2) + 's'} )`,
        );

        // Ajouter la tâche terminée à jobList.completed et la retirer de jobList.jobs
        jobList.completed.push(job);
        const jobIndex = jobList.jobs.indexOf(job);
        jobList.jobs.splice(jobIndex, 1);
        console.log('JOBINDEX: ', jobList.jobs.length);
      } catch (error) {
        console.error(`Error generating JPG for job ${job.cmd}:`, error);
      }
    }
    res.status(200).json({ message: 'Jobs completed successfully' });
  } catch (error) {
    console.error('Error running jobs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/delete_job', (req, res) => {
  const jobId = req.body._id;

  if (!jobId) {
    return res.status(400).json({ error: 'No job ID provided' });
  }

  // Trouver l'index de l'élément à supprimer
  const jobIndex = jobList.jobs.findIndex((job) => job._id === jobId);

  if (jobIndex === -1) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Supprimer l'élément du tableau
  jobList.jobs.splice(jobIndex, 1);

  return res.sendStatus(200); // Renvoie un statut de succès
});

app.post('/add_job', (req, res) => {
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
    prodBlanc: req.body.prodBlanc,
    format: req.body.format,
    visuel: req.body.visuel,
    numCmd: req.body.numCmd,
    ville: req.body.ville != null ? req.body.ville.toUpperCase() : '',
    ex: req.body.ex != null ? req.body.ex : '',
    perte: req.body.perte,
    regmarks: req.body.regmarks,
  };
  let visuel = data.visuel.split('/').pop();
  visuel = data.visuel.split('-').pop();

  let visuPath = data.visuel;
  let formatTauro = data.formatTauro;
  let prodBlanc = data.prodBlanc;
  let allFormatTauro = data.allFormatTauro;
  let format = data.format;
  let reg = data.regmarks;

  //Chemin sortie fichiers
  prodBlanc ? (writePath = saveFolder + '/Prod avec BLANC') : (writePath = saveFolder + '/' + formatTauro);

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

  // JOBS LIST STANDBY
  const newJob = createJob(
    date,
    time,
    data.numCmd,
    data.ville,
    format,
    formatTauro,
    visuel,
    data.ex,
    visuPath,
    writePath,
    jpgName,
    reg,
  );
  jobList.jobs.push(newJob);
  // console.log('En attente: ', jobList.jobs);
  // console.log('Completed: ', jobList.completed);

  res.sendStatus(200);
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
    prodBlanc: req.body.prodBlanc,
    format: req.body.format,
    visuel: req.body.visuel,
    numCmd: req.body.numCmd,
    ville: req.body.ville != null ? req.body.ville.toUpperCase() : '',
    ex: req.body.ex != null ? req.body.ex : '',
    perte: req.body.perte,
    regmarks: req.body.regmarks,
  };
  let visuel = data.visuel.split('/').pop();
  visuel = data.visuel.split('-').pop();
  let visuPath = data.visuel;
  let formatTauro = data.formatTauro;
  let prodBlanc = data.prodBlanc;
  let allFormatTauro = data.allFormatTauro;
  let format = data.format;
  let reg = data.regmarks;

  //Lecture Ecriture format tauro
  let arr = [];
  if (fs.existsSync('./formatsTauro.conf')) {
    const readFile = fs.readFileSync('./formatsTauro.conf', {
      encoding: 'utf8',
    });
    arr.push(readFile.split(/\r?\n/g));
    if (allFormatTauro.length > arr[0].length) {
      fs.writeFileSync('./formatsTauro.conf', allFormatTauro.join('\n'));
    }
  }

  //Chemin sortie fichiers
  prodBlanc ? (writePath = saveFolder + '/Prod avec BLANC') : (writePath = saveFolder + '/' + formatTauro);

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

  // JOBS LIST STANDBY
  const newJob = createJob(
    date,
    time,
    data.numCmd,
    data.ville,
    format,
    formatTauro,
    visuel,
    data.ex,
    visuPath,
    writePath,
    jpgName,
    reg,
  );
  jobList.jobs.push(newJob);
  console.log('En attente: ', jobList.jobs);
  console.log('Completed: ', jobList.completed);

  //Edition pdf
  start = performance.now();
  await modifyPdf(visuPath, writePath, fileName, format, formatTauro, reg);
  timeExec = parseFloat(((((performance.now() - start) % 360000) % 60000) / 1000).toFixed(2));
  pdfTime = timeExec;
  console.log(`Pdf: ✔️`);

  //Genererate img
  try {
    start = performance.now();
    await _useWorker({ pdf: `${pdfName}.pdf`, jpg: `${jpgName}.jpg` });
    timeExec = parseFloat(((((performance.now() - start) % 360000) % 60000) / 1000).toFixed(2));
    jpgTime = timeExec;

    console.log(`Jpg: ✔️`);
    console.log(`${date} ${time}:`, fileName + '✔️');

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
      XLSX.utils.sheet_add_json(ws, dataFileExport, {
        origin: -1,
        skipHeader: true,
      });
      XLSX.writeFile(wb, './public/session.xlsx', { cellStyles: true });
    } else {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(dataFileExport);
      XLSX.utils.book_append_sheet(wb, ws, 'session');
      XLSX.writeFile(wb, './public/session.xlsx');
    }
  } catch (error) {
    console.log('FAILED GENERATE IMAGE: ', error);
  }
  //Générer découpe
  try {
    const fTauro = formatTauro.split('_').pop();
    const wPlate = parseFloat(fTauro.split('x')[0]);
    const hPlate = parseFloat(fTauro.split('x')[1]);
    const width = parseFloat(format.split('x')[0]);
    const height = parseFloat(format.split('x')[1]);

    createDec(wPlate, hPlate, width, height);
  } catch (error) {
    console.log(error);
  }

  //JOBS LIST completed
  const findJob = jobList.jobs.find((x) => x._id === newJob._id);
  const index = jobList.jobs.indexOf(findJob);
  if (index > -1) {
    jobList.jobs.splice(index, 1);
  }
  jobList.completed.push(findJob);
  console.log('En attente: ', jobList.jobs);
  console.log('Completed: ', jobList.completed);

  res.status(200).send();
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
    const readFile = fs.readFileSync('./formatsTauro.conf', {
      encoding: 'utf8',
    });
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

app.get('/download', (req, res) => {
  const files = fs.readdirSync(path.join(__dirname, './public/tmp/'));
  files.forEach((file) => {
    if (path.extname(file) == '.dxf') {
      fileDownload = file;
      console.log('✔️ ', file);
    } else if (path.extname(file) == '.svg') {
      fileDownload = file;
      console.log('✔️ ', file);
    }
  });

  res.download('./public/tmp/' + fileDownload, (err) => {
    if (err) {
      console.log('Download error: ', err);
      res.redirect('/');
    }
  });
});

app.get('/jobs', (req, res) => {
  res.json(jobList);
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
