require("dotenv").config();
const { v4: uuidv4 } = require("uuid");
const chalk = require("chalk");
const express = require("express");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const app = express();
const path = require("path");
const os = require("os");
const fs = require("fs");
const { performance } = require("perf_hooks");
const { Worker, workerData } = require("worker_threads");
const WebSocket = require("ws");
const http = require("http");
const PORT = process.env.PORT_HTTP || 8000;

const serveIndex = require("serve-index");
const cors = require("cors");
const morgan = require("morgan");
const checkVersion = require("./src/checkVersion");
const modifyPdf = require("./src/app");
const modifyPdfCasto = require("./src/appCasto.js");
const getFiles = require("./src/getFiles").getData;
const createDec = require("./src/dec");
const createEskoCut = require("./src/generateCutFile");
const createJob = require("./src/jobsList");
const createXlsx = require("./src/xlsx");
const mongoose = require("./src/mongoose");
const modelDeco = require("./src/models/Deco");
const User = require("./src/models/User");
const symlink = require("./src/symlink");
const checkVernis = require("./src/checkVernis");
const generateQRCode = require("./src/qrcode");
const createQRCodePage = require("./src/QRCodePage");
const { generateStickers, createStickersPage } = require("./src/generateStickers");
const { processAllPDFs } = require("./src/generatePreview");
const { cmToPxl } = require("./src/convertUnits");
const generateImages = require("./src/generateImages");
const getPreview = require("./src/getPreview");
const findStock = require("./src/findStock");

const log = console.log;

const accessLogStream = fs.createWriteStream(path.join(__dirname, "server.log"), { flags: "a" });
const dayDate = new Date()
  .toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
  .replace(".", "")
  .toLocaleUpperCase();

// Path Sources Deco
let decoLM;
let decoCASTO;
let previewDeco;
let jpgPath = "./server/public";
let sessionPRINTSA = `PRINTSA#${dayDate}`;

//Lecture fichier config
async function LinkFolders(pathUpdate) {
  const configPath = path.join("./config.json");
  let config = {};
  // Lire le fichier s'il existe
  if (fs.existsSync(configPath)) {
    const readFile = fs.readFileSync(configPath, "utf8");
    try {
      config = JSON.parse(readFile);
    } catch (error) {
      return console.error(error);
    }
  }

  for (const key in config) {
    if (key !== "vernis") await symlink(config[key], path.join(__dirname, `./public/${key.toUpperCase()}`), pathUpdate);
    switch (key) {
      case "LM":
        decoLM = `./server/public/${key}`;
        break;
      case "CASTO":
        decoCASTO = `./server/public/${key}`;
        break;
      case "preview":
        previewDeco = `./server/public/${key}`;
        break;
      default:
        break;
    }
  }
}

LinkFolders(false);

//Path export
const saveFolder =
  process.env.NODE_ENV === "development" ? path.join(__dirname, "/public/tmp") : path.join(__dirname, "/public/TAURO");

// Lecture et parsing du fichier package.json
const packageJsonPath = path.join(__dirname, "../package.json");
let appVersion;
try {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  appVersion = packageJson.version;
  log("Version de l'application: " + chalk.blue(appVersion));
} catch (err) {
  log(chalk.red("Erreur lors de la lecture du fichier package.json: "), err);
}
const corsOptions = {
  origin: ["http://localhost:8000", "http://localhost:5173"],
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
};

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(morgan("combined", { stream: accessLogStream }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

app.use("/public", express.static(__dirname));
app.use(express.static(__dirname + "/public"));
app.use("/public/PREVIEW", express.static(__dirname + "/public/PREVIEW"));
app.use(express.static(path.join(__dirname, "../client/dist")));
app.use(
  "/louis",
  express.static(__dirname + `/public/${sessionPRINTSA}/`),
  serveIndex(path.join(__dirname, `/public/${sessionPRINTSA}/`), { icons: true }),
);
app.use(
  "/qrcode",
  express.static(__dirname + `/public/${sessionPRINTSA}/QRCodes/`),
  serveIndex(path.join(__dirname, `/public/${sessionPRINTSA}/QRCodes/`), {
    icons: true,
  }),
);

let fileName = "",
  fileName2 = "",
  writePath = "",
  jpgName = "",
  jpgName2 = "",
  pdfTime,
  jpgTime,
  fileDownload;

// const testSession = require('../testSession.json');
let jobList = {
  jobs: [],
  completed: [],
};

//RESTAURATION JOBS SI PLANTAGE
const backupPath = path.join(__dirname, "./backups/jobs_backup.json");

if (fs.existsSync(backupPath)) {
  try {
    const backupData = JSON.parse(fs.readFileSync(backupPath, "utf8"));
    jobList.jobs = backupData;
    console.log("♻️ Jobs restaurés depuis le backup.");
  } catch (e) {
    console.error("❌ Erreur lors de la restauration du backup", e);
  }
}

const server = http.createServer(app); // Créer le serveur HTTP
const wss = new WebSocket.Server({ server: server });

wss.on("connection", (ws) => {
  ws.on("close", () => {});
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
    const worker = new Worker(path.join(__dirname, "./src/pdfToimg.js"), { workerData: data });
    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

app.patch("/edit_job", async (req, res) => {
  const updates = req.body;

  // Rechercher l'objet par `_id`
  const objIndex = jobList.jobs.findIndex((obj) => obj._id === updates._id);

  if (objIndex === -1) {
    return res.status(404).json({ error: "Objet non trouvé" });
  }

  // Mettre à jour l'objet avec les nouvelles valeurs
  jobList.jobs[objIndex] = { ...jobList.jobs[objIndex], ...updates };
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "update" }));
    }
  });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "update" }));
    }
  });

  // Envoyer la réponse
  res.status(200).json({ message: "Objet mis à jour avec succès", object: jobList.jobs[objIndex] });
});

app.post("/add_job", async (req, res) => {
  const data = {
    client: req.body.client,
    allFormatTauro: req.body.allFormatTauro,
    formatTauro: req.body.formatTauro,
    prodBlanc: req.body.prodBlanc,
    format: req.body.format,
    format2: req.body.format2,
    visuel: req.body.visuel,
    visuel2: req.body.visuel2,
    numCmd: req.body.numCmd,
    ville: req.body.ville != null ? req.body.ville.toUpperCase() : "",
    ex: req.body.ex !== null ? req.body.ex : "",
    regmarks: req.body.regmarks,
    cut: req.body.cut,
    teinteMasse: req.body.teinteMasse,
  };
  let client = data.client != null ? data.client.toUpperCase() : "";
  let visuel = data.visuel.split("/").pop();
  visuel = visuel.includes("-") ? visuel.split("-").pop() : visuel;

  let visuel2 = data.visuel2.split("/").pop();
  visuel2 = visuel2.includes("-") ? visuel2.split("-").pop() : visuel2;

  let visuPath = data.visuel;
  let visuPath2 = data.visuel2;
  let formatTauro = data.formatTauro;
  formatTauro = formatTauro.split("_").pop();
  let prodBlanc = data.prodBlanc;
  let allFormatTauro = data.allFormatTauro;
  let format = data.format;
  let format2 = data.format2;
  let reg = data.regmarks;
  let teinteMasse = data.teinteMasse;

  //Chemin sortie fichiers
  prodBlanc
    ? (writePath = path.join(saveFolder + "/Prod avec BLANC"))
    : (writePath = path.join(saveFolder + "/Deco_Std_" + formatTauro));

  //Nom fichier
  fileName = `${data.numCmd} - LM ${data.ville.toUpperCase()} - ${teinteMasse === true ? format?.split("_").pop() : formatTauro} - ${visuel.replace(
    /\.[^/.]+$/,
    "",
  )} ${data.ex}_EX`;
  fileName2 = `${data.numCmd} - LM ${data.ville.toUpperCase()} - ${teinteMasse === true ? format2?.split("_").pop() : formatTauro} - ${visuel2.replace(/\.[^/.]+$/, "")} ${data.ex}_EX`;

  //Verifier si dossiers exist si pas le créer
  if (fs.existsSync(writePath) && fs.existsSync(`${jpgPath}/${sessionPRINTSA}`)) {
    pdfName = fileName2 ? writePath + "/" + fileName + " - " + fileName2 : writePath + "/" + fileName;
    console.log(pdfName);
    jpgName = `${jpgPath}/${sessionPRINTSA}` + "/" + fileName;
    jpgName2 = `${jpgPath}/${sessionPRINTSA}` + "/" + fileName2;
  } else {
    fs.mkdirSync(writePath, { recursive: true });
    fs.mkdirSync(`${jpgPath}/${sessionPRINTSA}`, { recursive: true });
    pdfName = fileName2 ? writePath + "/" + fileName + " - " + fileName2 : writePath + "/" + fileName;
    jpgName = `${jpgPath}/${sessionPRINTSA}` + "/" + fileName;
    jpgName2 = `${jpgPath}/${sessionPRINTSA}` + "/" + fileName2;
  }

  const parseDimensions = (format) => {
    const [width, height] = format.toLowerCase().split("_").pop().split("x");

    return [parseFloat(width), parseFloat(height)];
  };

  const [widthPlaque, heightPlaque] = parseDimensions(formatTauro);
  const [widthVisu, heightVisu] = parseDimensions(format);
  const perteCalc = parseFloat(widthPlaque * heightPlaque - widthVisu * heightVisu) / 10000;

  // JOBS LIST STANDBY
  const matchRef = visuel.match(/\d{8,13}/);
  const matchRef2 = visuel2.match(/\d{8,13}/);
  const newJob = createJob(
    client,
    data.numCmd,
    data.ville,
    format,
    format2,
    formatTauro,
    visuel,
    visuel2,
    matchRef ? matchRef[0] : 0,
    matchRef2 ? matchRef2[0] : 0,
    data.ex,
    visuPath,
    visuPath2,
    writePath,
    jpgName,
    jpgName2,
    reg,
    data.cut,
    data.teinteMasse,
    perteCalc,
  );
  // Fonction pour comparer et mettre à jour les tableaux
  function compareAndAddObject(originalArray, newObject) {
    const jobExist = originalArray.find(
      (item) => item.cmd === newObject.cmd && item.ref === newObject.ref && item.visuel === newObject.visuel,
    );

    if (jobExist) {
      return { exist: true, object: jobExist };
    } else {
      originalArray.push(newObject);
      return { exist: false, object: newObject };
    }
  }

  const result = compareAndAddObject(jobList.jobs, newJob);

  //Vérifier si model déjà en stock
  const modelStock = [];
  await findStock(matchRef[0]).then((stock) => {
    if (!stock) return;
    const { visuel, finition, format, ref, ex } = stock;
    modelStock.push(visuel, ref, format, finition, ex);
  });

  if (result.exist) {
    return res.status(200).json({ message: "Commande déjà existante", object: result.object });
  } else {
    return res.status(201).json({ message: "Commande ajoutée", object: result.object, stock: modelStock });
  }
});

app.post("/run_jobs", async (req, res) => {
  // Lecture Ecriture format tauro
  const filePath = path.join(__dirname, "./formatsTauro.conf");
  let arr = [];
  if (fs.existsSync(filePath)) {
    const readFile = fs.readFileSync(filePath, {
      encoding: "utf8",
    });
    arr.push(readFile.split(/\r?\n/g));
  }

  if (req.body.formatTauro.length > arr.length) {
    fs.writeFileSync(filePath, req.body.formatTauro.join("\n"));
  }

  const status = req.body.run;
  if (!status) {
    return res.status(400).json({ error: "Jobs not run" });
  }

  try {
    //Reset Jobs completed
    jobList.completed = [];

    // 🔄 Backup des jobs avant exécution
    const backupPath = path.join(__dirname, "./backups/jobs_backup.json");

    try {
      fs.mkdirSync(path.join(__dirname, "./backups"), { recursive: true });
      fs.writeFileSync(backupPath, JSON.stringify(jobList.jobs, null, 2), "utf8");
      console.log("📝 Backup des jobs créé.");
    } catch (e) {
      console.error("❌ Impossible de créer le backup des jobs", e);
    }

    const jobsToRun = [...jobList.jobs]; // Créer une copie pour éviter de modifier l'original pendant l'itération
    const startTime = performance.now();
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "start", startTime }));
      }
    });
    for (const job of jobsToRun) {
      // Date
      let time = new Date().toLocaleTimeString("fr-FR");
      let date = new Date()
        .toLocaleDateString("fr-FR", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
        .replace(".", "")
        .toLocaleUpperCase();

      // Nom fichier
      const fileName = `${job.cmd} - ${job.client} ${job.ville.toUpperCase()} - ${
        job.teinteMasse ? job.format_visu.split("_").pop() : job.format_Plaque.split("_").pop()
      } - ${job.visuel.replace(/\.[^/.]+$/, "")} ${job.ex}_EX`;

      const fileName2 =
        `${job.cmd} - ${job.client} ${job.ville.toUpperCase()} - ${
          job.teinteMasse ? job.format2_visu.split("_").pop() : job.format_Plaque.split("_").pop()
        } - ${job.visuel2.replace(/\.[^/.]+$/, "")} ${job.ex}_EX` || "";

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
            `${jpgPath}/${sessionPRINTSA}/${checkVernis(fileName) === "_S" ? "Satin" : checkVernis(fileName)}`,
          )
        )
          fs.mkdirSync(
            `${jpgPath}/${sessionPRINTSA}/${checkVernis(fileName) === "_S" ? "Satin" : checkVernis(fileName)}`,
            { recursive: true },
          );
      }

      const pdfName = `${job.writePath}/${fileName}`;
      const pdfName2 = `${job.writePath}/${fileName2}` || "";

      const jpgName = sortFolder
        ? `${jpgPath}/${sessionPRINTSA}/${checkVernis(fileName) === "_S" ? "Satin" : checkVernis(fileName)}/${fileName}`
        : `${jpgPath}/${sessionPRINTSA}/${fileName}`;
      const jpgName2 = sortFolder
        ? `${jpgPath}/${sessionPRINTSA}/${checkVernis(fileName2) === "_S" ? "Satin" : checkVernis(fileName2)}/${fileName2}`
        : `${jpgPath}/${sessionPRINTSA}/${fileName2}` || "";

      // Edition pdf
      if (!job.teinteMasse) {
        try {
          let startPdf = performance.now();
          if (job.client === "CASTO") {
            await modifyPdfCasto(
              {
                visuals: [
                  { file: job.visuPath, name: fileName },
                  { file: job.visuPath2, name: fileName2 },
                ],
                plaque: job.format_Plaque,
              },
              job.writePath,
            );
          } else {
            await modifyPdf(job.visuPath, job.writePath, fileName, job.format_visu, job.format_Plaque, job.reg);
            let endPdf = performance.now();
            pdfTime = endPdf - startPdf;
            console.log(
              `📁 ${date} ${time}:`,
              `${fileName}.pdf (${pdfTime < 1000 ? pdfTime.toFixed(2) + "ms" : (pdfTime / 1000).toFixed(2) + "s"})`,
            );
          }
        } catch (error) {
          console.error(`Error modifying PDF for job ${job.cmd}:`, error);
        }

        // Générer image
        try {
          let startJpg = performance.now();
          if (job.ref) {
            if (job.client === "CASTO") {
              getPreview(job.ref2, jpgName2);
            }
            getPreview(job.ref, jpgName);
            // await _useWorker({ pdf: `${pdfName}.pdf`, jpg: `${jpgName}.jpg` });
          } else {
            await _useWorker({ pdf: `${pdfName}.pdf`, jpg: `${jpgName}.jpg` });
            console.log("Image génerée");
          }
          let endJpg = performance.now();
          jpgTime = endJpg - startJpg;
          console.log(
            `🖼️  ${date} ${time}:`,
            `${fileName}.jpg (${jpgTime < 1000 ? jpgTime.toFixed(2) + "ms" : (jpgTime / 1000).toFixed(2) + "s"})`,
          );
        } catch (error) {
          console.error(`Error generating JPG for job ${job.cmd}:`, error);
        }
      } else {
        // Générer image
        try {
          generateImages(job, previewDeco, `${jpgName}.jpg`);
        } catch (error) {
          console.error(`Error generating JPG for job ${job.cmd}:`, error);
        }
      }

      //Get all data
      let matchName = job.visuel.match(/ \d{3}x\d{3}/i);
      let matchRef = job.visuel.match(/\d{8}/);
      const dataFileExport = [
        {
          date: job.date,
          numCmd: job.cmd,
          mag: job.ville,
          dibond: job.format_Plaque,
          deco: matchName ? job.visuel.substring(0, job.visuel.indexOf(matchName[0])) : job.visuel,
          ref: matchRef ? matchRef[0] : 0,
          format: job.format_visu.split("_").pop(),
          ex: parseInt(job.ex),
          temps: parseFloat(((jpgTime + pdfTime) / 1000).toFixed(2)) || 0,
          perte: parseFloat(job.perte),
          status: "",
          app_version: `v${appVersion}`,
          ip: req.ip.split(":").pop() === "1" || req.hostname === "localhost" ? os.hostname() : req.ip.split(":").pop(),
        },
      ];

      // SAVE DB
      try {
        const newDeco = new modelDeco(dataFileExport[0]);
        await newDeco.save();
      } catch (error) {
        console.log(error);
      }

      //Générer découpe
      if (job.cut) {
        const pathCutFiles = `./server/public/${sessionPRINTSA}/Cut/`;
        if (!fs.existsSync(pathCutFiles)) {
          fs.mkdirSync(pathCutFiles, { recursive: true });
        }
        try {
          const fTauro = job.format_Plaque.split("_").pop();
          const fVisu = job.format_visu.split("_").pop();
          const wPlate = parseFloat(fTauro.toLowerCase().split("x")[0]);
          const hPlate = parseFloat(fTauro.toLowerCase().split("x")[1]);
          const width = parseFloat(fVisu.toLowerCase().split("x")[0]);
          const height = parseFloat(fVisu.toLowerCase().split("x")[1]);
          createDec(wPlate, hPlate, width, height, pathCutFiles);
          createEskoCut(hPlate * 10, wPlate * 10, height * 10, width * 10, 6, pathCutFiles);
        } catch (error) {
          console.log(error);
        }
      }

      // Ajouter la tâche terminée à jobList.completed et la retirer de jobList.jobs
      jobList.completed.push(job);
      broadcastCompletedJob(job);
    }

    // Supprimer tous les jobs traités de jobList.jobs
    jobList.jobs = jobList.jobs.filter(
      (job) => !jobList.completed.some((completedJob) => completedJob._id === job._id),
    );

    //  Suppression du backup après succès
    try {
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
        console.log("✔️ Backup supprimé après exécution des jobs");
      }
    } catch (e) {
      console.error("❌ Impossible de supprimer le backup", e);
    }

    const endTime = performance.now();
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "end", endTime }));
      }
    });

    try {
      // Récupérer les données du corps de la requête
      const { stickersData, paperSticker } = req.body;
      const baseFolder = path.join(__dirname, `./public/${sessionPRINTSA}`);
      const tempFolder = path.join(baseFolder, "_tmp");
      const etiquettesFolder = path.join(baseFolder, "Etiquettes");

      // Vérifier et créer les dossiers si nécessaires
      await fs.promises.mkdir(tempFolder, { recursive: true });
      await fs.promises.mkdir(etiquettesFolder, { recursive: true });

      // Générer les étiquettes
      await generateStickers(jobList.completed, tempFolder, stickersData);

      // Chemin du fichier PDF
      const pdfPath = path.join(etiquettesFolder, `${sessionPRINTSA}.pdf`);

      // Générer le PDF
      await createStickersPage(tempFolder, pdfPath, paperSticker);

      // Lire et déplacer les fichiers
      const files = await fs.promises.readdir(tempFolder);
      await Promise.all(
        files.map(async (file) => {
          const oldPath = path.join(tempFolder, file);
          const newPath = path.join(etiquettesFolder, file);
          await fs.promises.rename(oldPath, newPath);
        }),
      );

      // Supprimer le dossier temporaire
      await fs.promises.rm(tempFolder, { recursive: true, force: true });
    } catch (error) {
      console.error("❌ Erreur lors de la génération des étiquettes :", error);
    }

    //Generer QRCode page
    // const pathQRCodes = `./server/public/${sessionPRINTSA}/QRCodes/`;
    // createQRCodePage(pathQRCodes, pathQRCodes + '/' + sessionPRINTSA + '.pdf');

    res.status(200).json({ message: "Jobs completed successfully" });
  } catch (error) {
    console.error("Error running jobs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/delete_job", (req, res) => {
  const jobId = req.body._id;

  if (!jobId) {
    return res.status(400).json({ error: "No job ID provided" });
  }

  // Trouver l'index de l'élément à supprimer
  const jobIndex = jobList.jobs.findIndex((job) => job._id === jobId);

  if (jobIndex === -1) {
    return res.status(404).json({ error: "Job not found" });
  }

  // Supprimer l'élément du tableau
  jobList.jobs.splice(jobIndex, 1);

  return res.sendStatus(200); // Renvoie un statut de succès
});

app.delete("/delete_job_completed", (req, res) => {
  const clearJobs = req.body.clear;

  if (!clearJobs) {
    return res.status(400).json({ error: "No jobs " });
  }
  // Supprimer l'élément du tableau
  jobList.completed = [];
  return res.sendStatus(200); // Renvoie un statut de succès
});

app.get("/process", async (req, res) => {
  let time = new Date().toLocaleTimeString("fr-FR");
  const version = await checkVersion().then((res) => res.message);

  res.status(200).json({
    jpgTime: parseFloat(jpgTime),
    pdfTime: parseFloat(pdfTime),
    jpgPath: jpgName.split("/").slice(2).join("/") + ".jpg",
    fileName: fileName,
    time: time,
    version: version,
  });
});

app.get("/public", async (req, res) => {
  res.status(200).send();
});

app.get("/path", async (req, res) => {
  if (typeof decoLM === "string" || typeof decoCASTO === "string" || typeof previewDeco === "string") {
    let jpgFiles = [];
    if (fs.existsSync(previewDeco)) {
      const files = fs.readdirSync(previewDeco, { withFileTypes: true });
      jpgFiles = files.filter((file) => file.isFile() && file.name.endsWith(".jpg"));
    }

    const dirLM = await getFiles(decoLM);
    const dirCASTO = await getFiles(decoCASTO);
    const dirDecoPreview = jpgFiles.map((file) => ({
      name: file.name,
      path: path.join(previewDeco, file.name),
    }));

    res.json([
      {
        LM: dirLM,
        CASTO: dirCASTO,
        Preview: dirDecoPreview,
      },
    ]);
  } else {
    res.json({ message: "Aucun répertoire valide !" });
  }
});

app.get("/formatsTauro", (req, res) => {
  const filePath = path.join(__dirname, "./formatsTauro.conf");

  if (fs.existsSync(filePath)) {
    const readFile = fs.readFileSync(filePath, { encoding: "utf8" });
    const lines = readFile.split(/\r?\n/g).filter((line) => line.trim() !== ""); // filtre les lignes vides

    const json = lines.map((v, i) => ({
      id: i,
      value: v,
    }));

    res.json(json);
  } else {
    // Crée le fichier vide si inexistant
    fs.writeFileSync(filePath, "");
    res.json([]); // renvoie un tableau vide
  }
});

app.post("/config", (req, res) => {
  const configPath = path.join("./config.json");
  let previousConfig = {};

  // Lire le fichier s'il existe
  if (fs.existsSync(configPath)) {
    const readFile = fs.readFileSync(configPath, "utf8");
    previousConfig = JSON.parse(readFile);
  }

  // Écrire les nouvelles données reçues
  fs.writeFileSync(configPath, JSON.stringify(req.body));
  LinkFolders(true);
  // Renvoyer l'ancien contenu du fichier ou un objet vide si le fichier n'existait pas
  res.json(previousConfig);
});

app.get("/config", (req, res) => {
  const configPath = path.join("./config.json");

  // Vérifier si le fichier existe
  if (fs.existsSync(configPath)) {
    const readFile = fs.readFileSync(configPath, "utf8");
    if (Object.keys(readFile).length !== 0) {
      res.json(JSON.parse(readFile)); // Envoyer le contenu du fichier en tant que JSON
    } else {
      res.status(404).send("<center><h4>Fichier de configuration non valide.</h4></center>");
    }
  } else {
    res.status(404).send("<center><h4>Fichier de configuration introuvable.</h4></center>");
  }
});

app.get("/qrcode", (req, res) => {
  res.status(200).send();
});

app.get("/jobs", async (req, res) => {
  res.json(jobList);
});

// Generer stickers uniquement
app.post("/generate_stickers", async (req, res) => {
  try {
    jobList.completed = [];
    const jobsToRun = [...jobList.jobs]; // copie des jobs

    if (!sessionPRINTSA) {
      return res.status(400).json({ error: "sessionPRINTSA est manquant" });
    }

    const baseFolder = path.join(__dirname, `./public/${sessionPRINTSA}`);
    const tempFolder = path.join(baseFolder, "_tmp");
    const etiquettesFolder = path.join(baseFolder, "Etiquettes");

    const startTime = performance.now();
    broadcastWS({ type: "start", startTime });

    // Création des dossiers
    await fs.promises.mkdir(tempFolder, { recursive: true });
    await fs.promises.mkdir(etiquettesFolder, { recursive: true });

    // Génération des stickers
    const startGenerateStickers = performance.now();
    await generateStickers(jobsToRun, tempFolder, true);

    // Génération du PDF final
    const pdfPath = path.join(etiquettesFolder, `${sessionPRINTSA}.pdf`);
    await createStickersPage(tempFolder, pdfPath, "A4");

    // Déplacement des images générées vers Etiquettes/
    const files = await fs.promises.readdir(tempFolder);
    await Promise.all(
      files.map((file) => fs.promises.rename(path.join(tempFolder, file), path.join(etiquettesFolder, file))),
    );

    // Ajouter les jobs complétés (bonne méthode)
    jobList.completed.push(...jobsToRun);
    broadcastCompletedJob(jobsToRun);

    // Retirer les jobs accomplis (fiable via _id)
    jobList.jobs = jobList.jobs.filter((job) => !jobsToRun.some((j) => j._id === job._id));

    // Suppression du dossier temporaire
    await fs.promises.rm(tempFolder, { recursive: true, force: true });

    const endTime = performance.now();
    broadcastWS({ type: "end", endTime });

    res.status(200).json({ message: "Étiquettes générées avec succès !" });
  } catch (error) {
    console.error("❌ Erreur lors de la génération des étiquettes :", error);
    res.status(500).json({ error: "Erreur lors de la génération des étiquettes" });
  }
});

// Helper WebSocket
function broadcastWS(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

server.listen(PORT, async () => {
  await checkVersion()
    .then((result) => {
      log(result.message);
    })
    .catch((error) => {
      console.error("Error:", error);
    });
  try {
    await processAllPDFs({
      pdfDirectory: path.join(decoLM),
      jpgDirectory: path.join(previewDeco),
      height: 1920,
      density: 72,
      parallelLimit: 5,
      verbose: false,
    });
  } catch (error) {
    console.error("Error:", error);
  }
  console.log(`Server start on port ${PORT}`);
  await mongoose().catch((err) => console.log(err));
});
