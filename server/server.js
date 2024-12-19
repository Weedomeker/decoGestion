require('dotenv').config();
const chalk = require('chalk');
const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');
const { performance } = require('perf_hooks');
const { Worker, workerData } = require('worker_threads');
const WebSocket = require('ws');
const http = require('http');
const PORT = process.env.PORT || 8000;
const serveIndex = require('serve-index');
const cors = require('cors');
const morgan = require('morgan');
const checkVersion = require('./src/checkVersion');
const modifyPdf = require('./src/app');
const getFiles = require('./src/getFiles').getData;
const createDec = require('./src/dec');
const createJob = require('./src/jobsList');
const createXlsx = require('./src/xlsx');
const mongoose = require('./src/mongoose');
const modelDeco = require('./src/models/Deco');
const symlink = require('./src/symlink');
const checkVernis = require('./src/checkVernis');
const createQRCodePage = require('./src/QRCodePage');

const log = console.log;

const accessLogStream = fs.createWriteStream(path.join(__dirname, 'server.log'), { flags: 'a' });
const dayDate = new Date()
  .toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  .replace('.', '')
  .toLocaleUpperCase();

// Path Sources Deco
let decoFolder;
let decoRaccordablesFolder;
let decoSurMesuresFolder;
let decoEcomFolder;
let decoSessionFolder;
let jpgPath = './server/public';
let sessionPRINTSA = `PRINTSA#${dayDate}`;

//Lecture fichier config
(async function () {
  const configPath = path.join('./config.json');
  let config = {};
  // Lire le fichier s'il existe
  if (fs.existsSync(configPath)) {
    const readFile = fs.readFileSync(configPath, 'utf8');
    try {
      config = JSON.parse(readFile);
    } catch (error) {
      return console.error(error);
    }
  }

  for (const key in config) {
    await symlink(config[key], path.join(__dirname, `./public/${key.toUpperCase()}`));

    if (key === 'standards') {
      decoFolder = `./server/public/${key}`;
    } else if (key === 'raccordables') {
      decoRaccordablesFolder = `./server/public/${key}`;
    } else if (key === 'surMesures') {
      decoSurMesuresFolder = `./server/public/${key}`;
    } else if (key === 'ecom') {
      decoEcomFolder = `./server/public/${key}`;
    } else {
      return;
    }
  }
})();
//Path export
const saveFolder =
  process.env.NODE_ENV === 'development' ? path.join(__dirname, '/public/tmp') : path.join(__dirname, '/public/TAURO');

// Gestion du chemin en fonction de l'environnement
const packageJsonPath = path.join(__dirname, '../package.json');

// Lecture et parsing du fichier package.json
let appVersion;
try {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  appVersion = packageJson.version;
  log("Version de l'application: " + chalk.blue(appVersion));
} catch (err) {
  log(chalk.red('Erreur lors de la lecture du fichier package.json: '), err);
}
const corsOptions = {
  origin: ['http://localhost:8000', 'http://localhost:5173', 'file'], // Ajoutez 'file://' pour accepter les requêtes locales d'Electron
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(morgan('combined', { stream: accessLogStream }));
app.use(express.urlencoded({ extended: false }));
app.use('/public', express.static(__dirname));
app.use('/download', express.static(__dirname + '/public/tmp'));
app.use(express.static(path.join(__dirname, '../client/dist')));
app.use(
  '/louis',
  express.static(saveFolder),
  serveIndex(saveFolder, { icons: true, stylesheet: path.join(__dirname, '/public/style.css') }),
);
app.use(
  '/qrcode',
  express.static(__dirname + `/public/${sessionPRINTSA}/QRCodes/`),
  serveIndex(path.join(__dirname, `/public/${sessionPRINTSA}/QRCodes/`), {
    icons: true,
    stylesheet: path.join(__dirname, '/public/style.css'),
  }),
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
  prodBlanc ? (writePath = saveFolder + '/Prod avec BLANC') : (writePath = path.join(saveFolder + '/' + formatTauro));

  //Nom fichier
  fileName = `${data.numCmd} - LM ${data.ville.toUpperCase()} - ${formatTauro} - ${visuel.replace(
    /\.[^/.]+$/,
    '',
  )} ${data.ex}_EX`;

  //Verifier si dossiers exist si pas le créer
  if (fs.existsSync(writePath) && fs.existsSync(`${jpgPath}/${sessionPRINTSA}`)) {
    pdfName = writePath + '/' + fileName;
    jpgName = `${jpgPath}/${sessionPRINTSA}` + '/' + fileName;
  } else {
    fs.mkdirSync(writePath, { recursive: true });
    fs.mkdirSync(`${jpgPath}/${sessionPRINTSA}`, { recursive: true });
    pdfName = writePath + '/' + fileName;
    jpgName = `${jpgPath}/${sessionPRINTSA}` + '/' + fileName;
  }

  const parseDimensions = (format) => {
    const [width, height] = format.toLowerCase().split('_').pop().split('x');

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
      const sortFolder = req.body.sortFolder;

      if (!fs.existsSync(job.writePath)) {
        fs.mkdirSync(job.writePath, { recursive: true });
      }
      const jpgPathExists = fs.existsSync(`${jpgPath}/${sessionPRINTSA}`);

      if (!jpgPathExists) {
        fs.mkdirSync(`${jpgPath}/${sessionPRINTSA}`, { recursive: true });
      }

      if (sortFolder) {
        if (
          !fs.existsSync(
            `${jpgPath}/${sessionPRINTSA}/${checkVernis(fileName) === '_S' ? 'Satin' : checkVernis(fileName)}`,
          )
        )
          fs.mkdirSync(
            `${jpgPath}/${sessionPRINTSA}/${checkVernis(fileName) === '_S' ? 'Satin' : checkVernis(fileName)}`,
            { recursive: true },
          );
      }

      const pdfName = `${job.writePath}/${fileName}`;
      const jpgName = sortFolder
        ? `${jpgPath}/${sessionPRINTSA}/${checkVernis(fileName) === '_S' ? 'Satin' : checkVernis(fileName)}/${fileName}`
        : `${jpgPath}/${sessionPRINTSA}/${fileName}`;

      // Edition pdf
      try {
        let startPdf = performance.now();
        await modifyPdf(job.visuPath, job.writePath, fileName, job.format_visu, job.format_Plaque, job.reg, job);
        let endPdf = performance.now();
        pdfTime = endPdf - startPdf;
        console.log(
          `✔️   ${date} ${time}:`,
          `${fileName}.pdf (${pdfTime < 1000 ? pdfTime.toFixed(2) + 'ms' : (pdfTime / 1000).toFixed(2) + 's'})`,
        );
      } catch (error) {
        console.error(`Error modifying PDF for job ${job.cmd}:`, error);
      }

      // Générer image
      try {
        let startJpg = performance.now();
        await _useWorker({ pdf: `${pdfName}.pdf`, jpg: `${jpgName}.jpg` });
        let endJpg = performance.now();
        jpgTime = endJpg - startJpg;
        console.log(
          `✔️   ${date} ${time}:`,
          `${fileName}.jpg (${jpgTime < 1000 ? jpgTime.toFixed(2) + 'ms' : (jpgTime / 1000).toFixed(2) + 's'})`,
        );
      } catch (error) {
        console.error(`Error generating JPG for job ${job.cmd}:`, error);
      }

      //Get all data
      let matchName = job.visuel.match(/ \d{3}x\d{3}/);
      let matchRef = job.visuel.match(/\d{8}/);
      const dataFileExport = [
        {
          date: job.date,
          numCmd: job.cmd,
          mag: job.ville,
          dibond: job.format_Plaque,
          deco: matchName ? job.visuel.substring(0, job.visuel.indexOf(matchName[0])) : '',
          ref: matchRef ? matchRef[0] : 0,
          format: job.format_visu.split('_').pop(),
          ex: parseInt(job.ex),
          temps: parseFloat(((jpgTime + pdfTime) / 1000).toFixed(2)),
          perte: parseFloat(job.perte),
          app_version: `v${appVersion}`,
          ip: req.hostname,
        },
      ];

      //XLSX LOG
      try {
        await createXlsx(dataFileExport);
      } catch (error) {
        console.error(error);
      }

      // SAVE DB
      try {
        const newDeco = new modelDeco(dataFileExport[0]);
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

          createDec(wPlate, hPlate, width, height, path.join(__dirname, '/public/tmp/Cut'));
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

    //Generer QRCode page
    const pathQRCodePage = path.join(__dirname, `./public/${sessionPRINTSA}/QRCodes`);
    createQRCodePage(pathQRCodePage, pathQRCodePage + '\\' + sessionPRINTSA + '.pdf');

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
  if (
    typeof decoFolder === 'string' ||
    typeof decoSurMesuresFolder === 'string' ||
    typeof decoRaccordablesFolder === 'string' ||
    typeof decoEcomFolder === 'string'
  ) {
    const dirDeco = await getFiles(decoFolder);
    const dirDecoSurMesures = await getFiles(decoSurMesuresFolder);
    const dirDecoRaccordables = await getFiles(decoRaccordablesFolder);
    const dirDecoEcom = await getFiles(decoEcomFolder);
    res.json([
      {
        Standards: dirDeco,
        SurMesures: dirDecoSurMesures,
        Raccordables: dirDecoRaccordables,
        Ecom: dirDecoEcom,
      },
    ]);
  } else {
    res.json({ message: 'Aucun répertoire valide !' });
  }
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

app.post('/config', (req, res) => {
  const configPath = path.join('./config.json');
  let previousConfig = {};

  // Lire le fichier s'il existe
  if (fs.existsSync(configPath)) {
    const readFile = fs.readFileSync(configPath, 'utf8');
    previousConfig = JSON.parse(readFile);
  }

  // Écrire les nouvelles données reçues
  fs.writeFileSync(configPath, JSON.stringify(req.body));

  // Renvoyer l'ancien contenu du fichier ou un objet vide si le fichier n'existait pas
  res.json(previousConfig);
});

app.get('/config', (req, res) => {
  const configPath = path.join('./config.json');

  // Vérifier si le fichier existe
  if (fs.existsSync(configPath)) {
    const readFile = fs.readFileSync(configPath, 'utf8');
    if (Object.keys(readFile).length !== 0) {
      res.json(JSON.parse(readFile)); // Envoyer le contenu du fichier en tant que JSON
    } else {
      res.status(404).send('<center><h4>Fichier de configuration non valide.</h4></center>');
    }
  } else {
    res.status(404).send('<center><h4>Fichier de configuration introuvable.</h4></center>');
  }
});

app.get('/qrcode', (req, res) => {
  res.status(200).send();
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

app.get('/api/commandes', async (req, res) => {
  try {
    const commandes = await modelDeco.find({}); // Récupère toutes les commandes depuis MongoDB
    const countTotalCommandes = await modelDeco.countDocuments();
    const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Liste des Commandes</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 20px;
          padding: 0;
          background-color: #f7f7f7;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          background: white;
        }
        th, td {
          padding: 10px;
          text-align: left;
          border: 1px solid #ddd;
        }
        th {
          background-color: #4CAF50;
          color: white;
          cursor: pointer;
        }
        td {
          background-color: #f2f2f2;
        }
        .pagination {
          display: flex;
          justify-content: center;
          margin-top: 20px;
        }
        .pagination button {
          margin: 0 5px;
          padding: 8px 12px;
          background-color: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        .pagination button.disabled {
          background-color: #ccc;
          cursor: not-allowed;
        }
        .pagination input {
          width: 50px;
          padding: 5px;
          text-align: center;
          margin-left: 10px;
        }
        .search-container {
          margin-bottom: 20px;
          display: flex;
          justify-content: flex-start;
        }
        .search-container input {
          padding: 8px;
          width: 200px;
          margin-right: 10px;
        }
      </style>
    </head>
    <body>
     <div><img width='140px' src="https://entreprise.leroymerlin.fr/images/logo.svg" alt="Logo Leroy Merlin" />
    <h2>Liste des Commandes</h2></div>
     
      <!-- Zone de recherche -->
      <div class="search-container">
        <input type="text" id="searchInput" placeholder="Rechercher par Numéro de Commande (cmd)" />
        <button id="searchButton">Rechercher</button>
      </div>

      <table id="commandesTable">
        <thead>
          <tr>
            <th data-column="Date">Date</th>
            <th data-column="numCmd">Numéro de Commandes</th>
            <th data-column="Mag">Magasins</th>
            <th data-column="Dibond">Dibonds</th>
            <th data-column="Deco">Déco</th>
            <th data-column="Ref">Référence</th>
            <th data-column="Formats">Formats</th>
            <th data-column="Ex">Ex(s)</th>
            <th data-column="Temps">Temps</th>
            <th data-column="Perte_m2">Perte (m²)</th>
          </tr>
        </thead>
        <tbody id="commandesBody">
          ${commandes
            .map(
              (commande) => `
            <tr data-cmd="${commande.numCmd}">
              <td>${new Date(commande.date).toLocaleDateString('fr-FR')}</td>
              <td>${commande.numCmd}</td>
              <td>${commande.mag}</td>
              <td>${commande.dibond}</td>
              <td>${commande.deco}</td>
              <td>${commande.ref}</td>
              <td>${commande.format}</td>
              <td>${commande.ex}</td>
              <td>${commande.temps}</td>
              <td>${commande.perte}</td>
            </tr>
          `,
            )
            .join('')}
        </tbody>
      </table>

      <div class="pagination" id="pagination"></div>
      <div class="pagination">Total documents: ${countTotalCommandes}</div>

      <script>
        document.addEventListener('DOMContentLoaded', () => {
          const rowsPerPage = 10; // Nombre de lignes par page
          const table = document.getElementById('commandesTable');
          const tbody = document.getElementById('commandesBody');
          const pagination = document.getElementById('pagination');
          const searchInput = document.getElementById('searchInput');
          const searchButton = document.getElementById('searchButton');
          const rows = Array.from(tbody.rows);
          let currentPage = 1;
          let sortedColumn = null;
          let sortOrder = 1; // 1 = ascendant, -1 = descendant
          
         // Fonction pour trier les lignes
function sortTable(column, order) {
  return rows.sort((a, b) => {
    // On sélectionne la cellule correspondante à la colonne
    const cellA = a.cells[column].textContent.trim(); 
    const cellB = b.cells[column].textContent.trim(); 

    // Si les cellules contiennent des nombres, on les convertit et on les compare
    if (!isNaN(cellA) && !isNaN(cellB)) {
      return (parseFloat(cellA) - parseFloat(cellB)) * order;
    } else {
      // Si ce sont des chaînes, on les compare lexicographiquement
      return cellA.localeCompare(cellB) * order;
    }
  });
}


          // Fonction pour afficher le tableau avec pagination
          function renderTable(page, filteredRows) {
            tbody.innerHTML = '';
            const rowsToDisplay = filteredRows.slice((page - 1) * rowsPerPage, page * rowsPerPage);
            rowsToDisplay.forEach(row => tbody.appendChild(row));
          }

          // Fonction pour afficher la pagination
          function renderPagination(filteredRows) {
            pagination.innerHTML = '';
            const totalPages = Math.ceil(filteredRows.length / rowsPerPage);

            // Créer les boutons de pagination
            const createButton = (text, page, disabled = false) => {
              const button = document.createElement('button');
              button.textContent = text;
              if (disabled) {
                button.classList.add('disabled');
                button.disabled = true;
              }
              button.addEventListener('click', () => {
                if (page) {
                  currentPage = page;
                  renderTable(currentPage, filteredRows);
                  renderPagination(filteredRows);
                }
              });
              return button;
            };

            pagination.appendChild(createButton('Premier', 1, currentPage === 1));
            pagination.appendChild(createButton('Précédent', currentPage > 1 ? currentPage - 1 : null, currentPage === 1));

            const totalPagesToShow = 5;
            const startPage = Math.max(1, currentPage - Math.floor(totalPagesToShow / 2));
            const endPage = Math.min(totalPages, startPage + totalPagesToShow - 1);

            for (let i = startPage; i <= endPage; i++) {
              pagination.appendChild(createButton(i, i));
            }

            pagination.appendChild(createButton('Suivant', currentPage < totalPages ? currentPage + 1 : null, currentPage === totalPages));
            pagination.appendChild(createButton('Dernier', totalPages, currentPage === totalPages));

            const input = document.createElement('input');
            input.type = 'number';
            input.min = 1;
            input.max = totalPages;
            input.value = currentPage;
            input.addEventListener('change', (e) => {
              const page = Math.max(1, Math.min(totalPages, parseInt(e.target.value)));
              currentPage = page;
              renderTable(currentPage, filteredRows);
              renderPagination(filteredRows);
            });
            pagination.appendChild(input);
          }

          // Fonction de recherche
          function searchByCmd() {
            const searchTerm = searchInput.value.trim();
            const filteredRows = rows.filter(row => {
              const cmd = row.dataset.cmd;
              return cmd && cmd.toString().includes(searchTerm);
            });

            renderTable(currentPage, filteredRows);
            renderPagination(filteredRows);
          }

          // Ajouter l'événement de recherche
          searchButton.addEventListener('click', searchByCmd);
          searchInput.addEventListener('input', searchByCmd);

          // Ajouter les événements de tri sur les en-têtes de colonnes
          table.querySelectorAll('th').forEach((th, index) => {
            th.addEventListener('click', () => {
              // Trier par la colonne cliquée
              if (sortedColumn === index) {
                sortOrder = -sortOrder; // Inverser l'ordre du tri
              } else {
                sortedColumn = index;
                sortOrder = 1; // Par défaut, tri croissant
              }
              const sortedRows = sortTable(sortedColumn + 1, sortOrder); // +1 car les index commencent à 0
              renderTable(currentPage, sortedRows);
              renderPagination(sortedRows);
            });
          });

          renderTable(currentPage, rows);
          renderPagination(rows);
        });
      </script>
    </body>
    </html>
    `;
    res.send(html);
  } catch (error) {
    console.error('Erreur lors de la récupération des commandes :', error);
    res.status(500).send('<h1>Erreur interne du serveur</h1>');
  }
});

app.get('/api/commandes/:cmd', async (req, res) => {
  const cmd = Number(req.params.cmd); // Convertir en nombre
  if (isNaN(cmd)) {
    return res.status(400).send("<h1>Erreur : Le paramètre 'cmd' doit être un nombre valide.</h1>");
  }

  // Recherche de toutes les commandes qui correspondent à 'numCmd'
  const commandes = await modelDeco.find({ numCmd: cmd });

  if (commandes.length === 0) {
    return res.status(404).send('<h1>Erreur : Aucune commande trouvée.</h1>');
  }

  // Générer le tableau HTML avec les données de toutes les commandes
  let rows = '';
  commandes.forEach((commande) => {
    rows += `
      <tr>
        <td>${new Date(commande.date).toLocaleDateString('fr-FR')}</td>
        <td>${commande.numCmd}</td>
        <td>${commande.mag}</td>
        <td>${commande.dibond}</td>
        <td>${commande.deco}</td>
        <td>${commande.ref}</td>
        <td>${commande.format}</td>
        <td>${commande.ex}</td>
        <td>${commande.temps}</td>
        <td>${commande.perte}</td>
      </tr>
    `;
  });

  // Générer la page HTML
  const html = `
  <!DOCTYPE html>
  <html lang="fr">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Commandes ${cmd}</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        margin: 20px;
        padding: 0;
        background-color: #f7f7f7;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 20px 0;
        background: white;
      }
      th, td {
        padding: 10px;
        text-align: left;
        border: 1px solid #ddd;
      }
      th {
        background-color: #4CAF50;
        color: white;
      }
      td {
        background-color: #f2f2f2;
      }
    </style>
  </head>
  <body>
  <div><img width='140px' src="https://entreprise.leroymerlin.fr/images/logo.svg" alt="Logo Leroy Merlin" />
    <h2>Détails commande(s) ${cmd}</h2></div>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Commande</th>
          <th>Magasin</th>
          <th>Dibond</th>
          <th>Déco</th>
          <th>Référence</th>
          <th>Format</th>
          <th>Ex(s)</th>
          <th>Temps</th>
          <th>Perte (m²)</th>
        </tr>
      </thead>
      <tbody>
        ${rows} <!-- Ici, on insère toutes les lignes générées dynamiquement -->
      </tbody>
    </table>
  </body>
  </html>
  `;

  // Envoyer la page HTML au client
  res.send(html);
});

server.listen(PORT, async () => {
  checkVersion()
    .then((result) => {
      log(result.message);
    })
    .catch((error) => {
      console.error('Error:', error);
    });

  console.log(`Server start on port ${PORT}`);
  await mongoose().catch((err) => console.log(err));
});
