const isDev = require('isdev');
const checkVersion = require('./src/checkVersion');
const version = require('../package.json');
const express = require('express');
const app = express();
const serveIndex = require('serve-index');
const cors = require('cors');
const modifyPdf = require('./src/app');
const getFiles = require('./src/getFiles').getData;
const createDec = require('./src/dec');
const createJob = require('./src/jobsList');
const path = require('path');
const fs = require('fs');
const { performance } = require('perf_hooks');
const { Worker, workerData } = require('worker_threads');
const WebSocket = require('ws');
const http = require('http');
const PORT = process.env.PORT || 8000;
const createXlsx = require('./src/xlsx');
const mongoose = require('./src/mongoose');
const modelDeco = require('./src/models/Deco');

//Path déco
const decoFolder = './server/public/deco';

//Path export
const saveFolder = isDev ? path.join(__dirname, '/public/tmp') : path.join(__dirname, '/public/tauro');
const jpgPath = './server/public';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/public', express.static(path.join(__dirname)));
app.use('/download', express.static(__dirname + '/public/tmp'));
app.use(express.static(path.join(__dirname, '../client/dist')));
app.use(
  '/louis',
  express.static(saveFolder),
  serveIndex(saveFolder, { icons: true, stylesheet: path.join(__dirname, '/public/style.css') }),
);

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

// WebSocket setup
const server = http.createServer(app); // Créer le serveur HTTP
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  ws.on('close', () => {});
});

const broadcastCompletedJob = (job) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ completedJob: job }));
    }
  });
};

function _useWorker(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, './src/pdfToimg.js'), { workerData: data });
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
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
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
  if (fs.existsSync(path.join(__dirname, './formatsTauro.conf'))) {
    const readFile = fs.readFileSync(path.join(__dirname, './formatsTauro.conf'), {
      encoding: 'utf8',
    });
    arr.push(readFile.split(/\r?\n/g));
    if (allFormatTauro.length > arr[0].length) {
      fs.writeFileSync(path.join(__dirname, './formatsTauro.conf'), allFormatTauro.join('\n'));
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

  //Edition pdf
  try {
    start = performance.now();
    await modifyPdf(visuPath, writePath, fileName, format, formatTauro, reg);
    timeExec = parseFloat(((((performance.now() - start) % 360000) % 60000) / 1000).toFixed(2));
    pdfTime = timeExec;
    console.log(`Pdf: ✔️`);
  } catch (error) {
    console.log(error);
  }

  //Genererate img
  try {
    start = performance.now();
    await _useWorker({ pdf: `${pdfName}.pdf`, jpg: `${jpgName}.jpg` });
    timeExec = parseFloat(((((performance.now() - start) % 360000) % 60000) / 1000).toFixed(2));
    jpgTime = timeExec;
    console.log(`Jpg: ✔️`);
    console.log(`${date} ${time}:`, fileName + '✔️');
  } catch (error) {
    console.log('FAILED GENERATE IMAGE: ', error);
  }

  const dataFileExport = [
    {
      Date: date,
      Heure: time,
      numCmd: parseFloat(fileName.split(' - ')[0]),
      Mag: fileName.split(' - ')[1],
      Dibond: fileName.split(' - ')[2],
      Deco: fileName.split(' - ').slice(2).pop(),
      Temps: parseFloat(((jpgTime + pdfTime) / 1000).toFixed(2)),
      Perte_m2: data.perte,
      app_version: `v${version.version}`,
      ip: req.hostname,
    },
  ];

  //XLSX create file
  try {
    await createXlsx(dataFileExport);
  } catch (error) {
    console.log(error);
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

  res.status(200).send();
});

app.patch('/edit_job', async (req, res) => {
  const updates = req.body;

  // Rechercher l'objet par `_id`
  const objIndex = jobList.jobs.findIndex((obj) => obj._id === updates._id);

  if (objIndex === -1) {
    return res.status(404).json({ error: 'Objet non trouvé' });
  }

  // Mettre à jour l'objet avec les nouvelles valeurs
  jobList.jobs[objIndex] = { ...jobList.jobs[objIndex], ...updates };
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'update' }));
    }
  });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'update' }));
    }
  });

  // Envoyer la réponse
  res.status(200).json({ message: 'Objet mis à jour avec succès', object: jobList.jobs[objIndex] });
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
    ex: req.body.ex !== null ? req.body.ex : '',
    regmarks: req.body.regmarks,
    cut: req.body.cut,
  };
  let visuel = data.visuel.split('/').pop();
  visuel = data.visuel.split('-').pop();

  let visuPath = data.visuel;
  let formatTauro = data.formatTauro;
  formatTauro = formatTauro.split('_').pop();
  let prodBlanc = data.prodBlanc;
  let allFormatTauro = data.allFormatTauro;
  let format = data.format;
  let reg = data.regmarks;

  //Chemin sortie fichiers
  prodBlanc ? (writePath = saveFolder + '/Prod avec BLANC') : (writePath = saveFolder + '/' + formatTauro);

  //Nom fichier
  fileName = `${data.numCmd} - LM ${data.ville.toUpperCase()} - ${formatTauro} - ${visuel.replace(
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

  const parseDimensions = (format) => {
    const [width, height] = format.split('_').pop().split('x');
    return [parseFloat(width), parseFloat(height)];
  };

  const [widthPlaque, heightPlaque] = parseDimensions(formatTauro);
  const [widthVisu, heightVisu] = parseDimensions(format);
  const perteCalc = parseFloat(widthPlaque * heightPlaque - widthVisu * heightVisu) / 10000;

  // JOBS LIST STANDBY
  const matchRef = visuel.match(/\d{8}/);
  const newJob = createJob(
    data.numCmd,
    data.ville,
    format,
    formatTauro,
    visuel,
    matchRef !== null ? matchRef[0] : 0,
    data.ex,
    visuPath,
    writePath,
    jpgName,
    reg,
    data.cut,
    perteCalc,
  );

  // Fonction pour comparer et mettre à jour les tableaux
  function compareAndAddObject(originalArray, newObject) {
    const jobExist = originalArray.find((item) => item.cmd === newObject.cmd && item.ref === newObject.ref);

    if (jobExist) {
      return { exist: true, object: jobExist };
    } else {
      originalArray.push(newObject);
      return { exist: false, object: newObject };
    }
  }

  const result = compareAndAddObject(jobList.jobs, newJob);

  if (result.exist) {
    return res.status(200).json({ message: 'Commande déjà existante', object: result.object });
  } else {
    return res.status(201).json({ message: 'Commande ajoutée', object: result.object });
  }
});

app.post('/run_jobs', async (req, res) => {
  //Lecture Ecriture format tauro
  let arr = [];
  if (fs.existsSync('./formatsTauro.conf')) {
    const readFile = fs.readFileSync('./formatsTauro.conf', {
      encoding: 'utf8',
    });
    arr.push(readFile.split(/\r?\n/g));
    if (req.body.formatTauro.length > arr[0].length) {
      fs.writeFileSync('./formatsTauro.conf', req.body.formatTauro.join('\n'));
    }
  }

  const status = req.body.run;
  if (!status) {
    return res.status(400).json({ error: 'Jobs not run' });
  }

  try {
    const jobsToRun = [...jobList.jobs]; // Créer une copie pour éviter de modifier l'original pendant l'itération
    const startTime = performance.now();
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'start', startTime }));
      }
    });
    for (const job of jobsToRun) {
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
      if (!fs.existsSync(job.writePath)) {
        fs.mkdirSync(job.writePath, { recursive: true });
      }
      const jpgPathExists = fs.existsSync(`${jpgPath}/PRINTSA#${date}`);
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
        pdfTime = endPdf - startPdf;
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
        jpgTime = endJpg - startJpg;
        console.log(
          `✔️ ${date} ${time}:`,
          `${fileName}.jpg (${jpgTime < 1000 ? jpgTime.toFixed(2) + 'ms' : (jpgTime / 1000).toFixed(2) + 's'})`,
        );
      } catch (error) {
        console.error(`Error generating JPG for job ${job.cmd}:`, error);
      }

      let matchName = job.visuel.match(/ \d{3}x\d{3}/);
      let matchRef = job.visuel.match(/\d{8}/);
      const dataFileExport = [
        {
          Date: job.date,
          numCmd: job.cmd,
          Mag: job.ville,
          Dibond: job.format_Plaque,
          Deco: matchName ? job.visuel.substring(0, job.visuel.indexOf(matchName[0])) : '',
          Ref: matchRef ? matchRef[0] : 0,
          Format: job.format_visu,
          Ex: parseInt(job.ex),
          Ex: parseInt(job.ex),
          Temps: parseFloat(((jpgTime + pdfTime) / 1000).toFixed(2)),
          Perte_m2: parseFloat(job.perte),
          Perte_m2: parseFloat(job.perte),
          app_version: `v${version.version}`,
          ip: req.hostname,
        },
      ];

      //XLSX LOG
      try {
        await createXlsx(dataFileExport);
      } catch (error) {
        console.error(error);
      }

      //SAVE DB
      try {
        const newDeco = new modelDeco(dataFileExport[0]);
        console.log(newDeco);
        await newDeco.save();
      } catch (error) {
        console.log(error);
      }

      //Générer découpe
      if (job.cut) {
        try {
          const fTauro = job.format_Plaque.split('_').pop();
          const wPlate = parseFloat(fTauro.split('x')[0]);
          const hPlate = parseFloat(fTauro.split('x')[1]);
          const width = parseFloat(job.format_visu.split('x')[0]);
          const height = parseFloat(job.format_visu.split('x')[1]);

          createDec(wPlate, hPlate, width, height);
        } catch (error) {
          console.log(error);
        }
      }

      // Ajouter la tâche terminée à jobList.completed et la retirer de jobList.jobs
      jobList.completed.push(job);
      broadcastCompletedJob(job);
    }

    // Supprimer tous les jobs traités de jobList.jobs
    jobList.jobs = jobList.jobs.filter((job) => !jobList.completed.includes(job));
    const endTime = performance.now();
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'end', endTime }));
      }
    });
    res.status(200).json({ message: 'Jobs completed successfully' });
  } catch (error) {
    console.error('Error running jobs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/delete_job', (req, res) => {
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

app.delete('/delete_job_completed', (req, res) => {
  const clearJobs = req.body.clear;

  if (!clearJobs) {
    return res.status(400).json({ error: 'No jobs ' });
  }
  // Supprimer l'élément du tableau
  jobList.completed = [];
  return res.sendStatus(200); // Renvoie un statut de succès
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
  if (fs.existsSync(path.join(__dirname, './formatsTauro.conf'))) {
    const readFile = fs.readFileSync(path.join(__dirname, './formatsTauro.conf'), {
      encoding: 'utf8',
    });
    arr.push(readFile.split(/\r?\n/g));

    const json = arr[0].map((v, i) => ({
      id: i,
      value: v,
    }));
    res.json(json);
  } else {
    fs.writeFileSync(path.join(__dirname, '/formatsTauro.conf'), '');
  }
});

app.get('/download', (req, res) => {
  const files = fs.readdirSync(path.join(__dirname, '/public/tmp/'));
  files.forEach((file) => {
    if (path.extname(file) == '.dxf') {
      fileDownload = file;
      console.log('✔️ ', file);
    } else if (path.extname(file) == '.svg') {
      fileDownload = file;
      console.log('✔️ ', file);
    }
  });

  res.download(path.join(__dirname, '/public/tmp/' + fileDownload), (err) => {
    if (err) {
      console.log('Download error: ', err);
      res.redirect('/');
    }
  });
});

app.get('/jobs', async (req, res) => {
  res.json(jobList);
});

server.listen(PORT, async () => {
  checkVersion()
    .then((result) => {
      console.log(result.message);
    })
    .catch((error) => {
      console.error('Error:', error);
    });
  console.log(`Server start on port ${PORT}`);
  await mongoose().catch((err) => console.log(err));
});
