require("dotenv").config();
const { v4: uuidv4 } = require("uuid");
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
const PORT = process.env.PORT || 8000;
const logger = require("./src/logger/logger");

const serveIndex = require("serve-index");
const cors = require("cors");
const morgan = require("morgan");
const checkVersion = require("./src/checkVersion");
const modifyPdf = require("./src/app");
const amalgameCredences = require("./src/amalgameCredences.js").modifyPdf;
const getFiles = require("./src/getFiles").getData;
const createDec = require("./src/dec");
const generateCutFile = require("./src/generateCutFile").generateCutFile;
const generateCutFileTwoCuts = require("./src/generateCutFile").generateCutFileTwoCuts;
const createJob = require("./src/jobsList");
const createXlsx = require("./src/xlsx");
const mongoose = require("./src/mongoose");
const modelDeco = require("./src/models/Deco");
const modelRefDeco = require("./src/models/RefDeco");
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
const Stocks = require("./src/models/Stocks");

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
let decoBRICO;
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
      return logger.error(error);
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
      case "BRICO":
        decoBRICO = `./server/public/${key}`;
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
  logger.info("Version de l'application: " + appVersion);
} catch (err) {
  logger.error("Erreur lors de la lecture du fichier package.json: ", err);
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
    logger.info("♻️ Jobs restaurés depuis le backup.");
  } catch (e) {
    logger.error("❌ Erreur lors de la restauration du backup", e);
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

//post get ref stock

app.post("/stock", async (req, res) => {
  const { ref } = req.body;
  if (!ref) return res.status(400).json({ error: "Ref required" });

  try {
    const stock = await findStock(ref);
    if (stock) return res.status(200).json({ stock });
    return res.status(404).json({ error: "Stock not found" });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

//get ref in stock

app.patch("/edit_job", async (req, res) => {
  const updates = req.body;

  if (!updates._id) {
    return res.status(400).json({ error: "ID requis" });
  }

  const objIndex = jobList.jobs.findIndex((obj) => String(obj._id) === String(updates._id));

  if (objIndex === -1) {
    return res.status(404).json({ error: "Objet non trouvé" });
  }

  const allowedFields = ["ville", "ex", "format", "visuel", "stock", "use", "useStock"];

  const filteredUpdates = Object.keys(updates)
    .filter((key) => allowedFields.includes(key))
    .reduce((obj, key) => {
      obj[key] = updates[key];
      return obj;
    }, {});

  jobList.jobs[objIndex] = {
    ...jobList.jobs[objIndex],
    ...filteredUpdates,
  };

  // WebSocket broadcast
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "update",
          object: jobList.jobs[objIndex],
        }),
      );
    }
  });
  res.status(200).json({
    message: "Objet mis à jour avec succès",
    object: jobList.jobs[objIndex],
  });
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
    numCmd: req.body.numCmd ? req.body.numCmd : 0,
    numCmd2: req.body.numCmd2 ? req.body.numCmd2 : 0,
    ville: req.body.ville != null ? req.body.ville?.toUpperCase() : "",
    ex: req.body.ex !== null ? req.body.ex : "",
    perte: req.body.perte,
    regmarks: req.body.regmarks,
    cut: req.body.cut,
    teinteMasse: req.body.teinteMasse,
    stock: req.body.stock,
  };
  let client = data.client != null ? data.client?.toUpperCase() : "";
  let visuel = data.visuel?.split("/")?.pop();
  let visuel2 = data.visuel2?.split("/").pop() || "";

  if (client === "LM") {
    visuel = visuel.includes("-") ? visuel.split("-")?.pop() : visuel;
    visuel2 = visuel2.includes("-") ? visuel2.split("-")?.pop() : visuel2;
  }

  if (client === "BRICO") {
    //visuel = visuel.split(/BRILLANT|MAT/)[0].trim();
    visuel = visuel.replace(".pdf", "").trim();
    visuel2 = visuel2.replace(".pdf", "").trim();
  }

  let visuPath = data.visuel;
  let visuPath2 = data.visuel2;
  let formatTauro = data.formatTauro;
  formatTauro = formatTauro.split("_")?.pop();
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
  let prefixClient = "";
  if (client === null) {
    prefixClient = "";
  } else if (client === "LM") {
    prefixClient = "LM";
  } else if (client === "CASTO") {
    prefixClient = "CASTO";
  } else if (client === "BRICO") {
    prefixClient = "BRICO";
  }
  fileName = `${data.numCmd} - ${prefixClient} ${data.ville ? data.ville.toUpperCase() + " - " : ""}${teinteMasse === true ? format?.split("_").pop()?.replace("/", "") : formatTauro} - ${visuel.replace(
    /\.[^/.]+$/,
    "",
  )} ${data.ex}_EX`;

  fileName2 = `${data.numCmd2 === 0 ? "" : data.numCmd2 + " - "}${prefixClient} ${data.ville ? data.ville.toUpperCase() + " - " : ""}${teinteMasse === true ? format2?.split("_").pop() : formatTauro} - ${visuel2.replace(/\.[^/.]+$/, "")} ${data.ex}_EX`;

  //Verifier si dossiers exist si pas le créer
  if (fs.existsSync(writePath) && fs.existsSync(`${jpgPath}/${sessionPRINTSA}`)) {
    pdfName = fileName2 ? writePath + "/" + fileName + " - " + fileName2 : writePath + "/" + fileName;
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

  // Extraire le format si défini
  const exactFormat = format?.match(/\d{3}x\d{2,}/i)?.[0];

  // Construire la query
  const query = { $text: { $search: visuel } };
  if (exactFormat) query.format = exactFormat;

  // Faire la recherche avec score
  const findRefTeinteMasse = data.teinteMasse
    ? await modelRefDeco
        .find(query, { score: { $meta: "textScore" } }) // projection : retourner le score
        .sort({ score: { $meta: "textScore" } })
        .limit(1)
    : null;

  let matchRef = data.teinteMasse ? findRefTeinteMasse?.[0]?.ref : visuel.match(/\d{8,13}/)?.[0];
  let matchRef2 = visuel2.match(/\d{8,13}/)?.[0];
  if (client === "BRICO") {
    const regex = /[A-Z]+-\d+/g;
    matchRef = visuel.match(regex)?.[0];
    matchRef2 = visuel2.match(regex)?.[0];
  }

  const newJob = createJob(
    client,
    data.numCmd,
    data.numCmd2,
    data.ville,
    format?.match(/\d{2,}x\d{2,}/i)?.[0],
    format2?.match(/\d{2,}x\d{2,}/i)?.[0],
    formatTauro,
    visuel,
    visuel2,
    matchRef ? matchRef : 0,
    matchRef2 ? matchRef2 : 0,
    data.ex,
    visuPath,
    visuPath2,
    writePath,
    jpgName,
    jpgName2,
    data.perte,
    reg,
    data.cut,
    data.teinteMasse,
    data.stock ? data.stock : false,
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

  // Vérifier si le modèle est déjà en stock
  let modelStock = null;
  if (matchRef) {
    const stock = await findStock(matchRef);
    if (stock) {
      const { visuel, finition, format, ref, ex } = stock;
      modelStock = { visuel, ref, format, finition, ex };
    }
  }

  if (result.exist) {
    return res.status(200).json({
      message: "Commande déjà existante",
      object: result.object,
    });
  }

  return res.status(201).json({
    message: "Commande ajoutée",
    object: result.object,
    stock: modelStock,
  });
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
      logger.info("📝 Backup des jobs créé.");
    } catch (e) {
      logger.error("❌ Impossible de créer le backup des jobs", e);
    }

    const jobsToRun = [...jobList.jobs]; // Créer une copie pour éviter de modifier l'original pendant l'itération

    const startTime = performance.now();
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "start", startTime }));
      }
    });

    // Traiter les jobs un par un
    for (const job of jobsToRun) {
      const regexCredences = /^\d{3}x\d{2}$/i;
      const isCredences = regexCredences.test(job.format_visu);

      //Verifier si en prit en stock
      const isStock = job?.useStock;

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

      const fileName2 = isCredences
        ? `${job.cmd2 === 0 ? "" : job.cmd2 + " - "}${job.client} ${job.ville.toUpperCase()} - ${
            job.teinteMasse ? job.format2_visu.split("_").pop() : job.format_Plaque.split("_").pop()
          } - ${job.visuel2.replace(/\.[^/.]+$/, "")} ${job.ex}_EX` || ""
        : "";

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

      const castoName = (name) => {
        if (typeof name !== "string" || name === undefined) {
          return;
        }
        return name
          .replace(/\d{3}x\d{3}/gi, "")
          .replace(/cm|CRED|-|\d{13}/gi, "")
          .replace(/\s+/g, " ")
          .trim();
      };

      const pdfName = `${job.writePath}/${fileName}`;
      const pdfName2 = `${job.writePath}/${fileName2}` || "";

      const jpgName = `${jpgPath}/${sessionPRINTSA}/${fileName}`;
      const jpgName2 = isCredences ? `${jpgPath}/${sessionPRINTSA}/${fileName2}` || "" : "";

      // Edition pdf
      if (!job.teinteMasse && !isStock) {
        try {
          let startPdf = performance.now();
          if (isCredences) {
            const visuals = [{ file: job.visuPath, name: fileName }];

            if (job.visuPath2) {
              visuals.push({
                file: job.visuPath2,
                name: fileName2,
              });
            }

            await amalgameCredences(
              {
                visuals,
                plaque: job.format_Plaque,
              },
              path.join(
                job.writePath,
                `${castoName(fileName)}${job.ref2.length > 0 ? " + " + castoName(fileName2) : ""}.pdf`,
              ),
            );

            let endPdf = performance.now();
            pdfTime = endPdf - startPdf;
          } else {
            await modifyPdf(job.visuPath, job.writePath, fileName, job.format_visu, job.format_Plaque, job.reg);
            let endPdf = performance.now();
            pdfTime = endPdf - startPdf;
          }
        } catch (error) {
          logger.error(`Erreur de modification du PDF pour le job ${job.cmd}: ${error}`);
        }

        // Générer image
        try {
          let startJpg = performance.now();
          if (job.ref) {
            if (isCredences && job.ref2) {
              await _useWorker({
                pdf: path.join(
                  job.writePath,
                  `${castoName(pdfName.split("/").pop())} + ${castoName(pdfName2.split("/").pop())}.pdf`,
                ),
                jpg: path.join(
                  `${jpgPath}/${sessionPRINTSA}/${castoName(jpgName.split("/").pop())} + ${castoName(jpgName2.split("/").pop())}.jpg`,
                ),
              });
            } else {
              getPreview(job.ref, jpgName, isStock);
            }
          } else {
            await _useWorker({ pdf: `${pdfName}.pdf`, jpg: `${jpgName}.jpg` });
          }
          let endJpg = performance.now();
          jpgTime = endJpg - startJpg;
        } catch (error) {
          logger.error(`Error generating JPG for job ${job.cmd}:`, error);
        }
      } else {
        // Générer image
        try {
          generateImages(job, previewDeco, `${jpgName}.jpg`, isStock);
        } catch (error) {
          logger.error(`Error generating JPG for job ${job.cmd}:`, error);
        }
      }

      // ===== VISUEL 1 =====
      const matchName1 = isCredences ? job.visuel.match(/ \d{3}x\d{2}/i) : job.visuel.match(/ \d{3}x\d{3}/i);

      let matchRef1;
      if (isCredences) {
        matchRef1 = job.visuel.match(/\d{13}/);
      } else {
        matchRef1 = job.visuel.match(/[A-Z]+-\d+/i) || job.ref;
      }

      const deco =
        matchName1 && job.visuel.includes(matchName1[0])
          ? job.client === "CASTO"
            ? job.visuel
                .split(matchName1[0])[1]
                ?.replace(/cm/gi, "")
                ?.replace(/\.pdf$/i, "")
                ?.replace(matchRef1 ? matchRef1[0] : "", "")
                ?.replace(" MAT", "")
                .trim()
            : job.visuel.split(matchName1[0])[0].trim()
          : job.visuel;

      // ===== VISUEL 2 (Credences) =====
      const matchName2 = isCredences && job.visuel2 ? job.visuel2.match(/ \d{3}x\d{2}/i) : null;

      const matchRef2 = job.visuel2
        ? isCredences
          ? job.visuel2.match(/\d{13}/)
          : job.visuel2.match(/[A-Z]+-\d+/i)
        : null;

      const deco2 =
        matchName2 && job.visuel2.includes(matchName2[0])
          ? job.visuel2
              .split(matchName2[0])[1]
              ?.replace(/cm/gi, "")
              ?.replace(/\.pdf$/i, "")
              ?.replace(matchRef2 ? matchRef2[0] : "", "")
              ?.replace(" MAT", "")
              .trim()
          : job.visuel2;

      const saveDeco = async ({ cmd, visuel, formatVisu, ref, temps }) => {
        const data = {
          date: job.date,
          client: job.client,
          numCmd: cmd || 0,
          mag: job.ville,
          dibond: job.format_Plaque,
          deco: visuel,
          ref: ref || 0,
          format: formatVisu?.split("_").pop().replace("/", ""),
          ex: parseInt(job.ex),
          temps,
          perte: job.perte ? parseFloat(job.perte) : 0,
          status: "",
          app_version: `v${appVersion}`,
          ip: req.ip.split(":").pop() === "1" || req.hostname === "localhost" ? os.hostname() : req.ip.split(":").pop(),
        };

        const newDeco = new modelDeco(data);
        await newDeco.save();
      };

      // SAVE DB
      try {
        const totalTime = parseFloat(((jpgTime + pdfTime) / 1000).toFixed(2)) || 0;
        // Export principal
        await saveDeco({
          cmd: job.cmd || 0,
          visuel: deco,
          formatVisu: job.format_visu,
          ref: job.ref,
          temps: totalTime,
        });

        // Export secondaire UNIQUEMENT si credences
        if (isCredences && job.cmd2 && job.visuel2) {
          await saveDeco({
            cmd: job.cmd2 || 0,
            visuel: deco2,
            formatVisu: job.format2_visu,
            ref: job.ref2,
            temps: totalTime,
          });
        }
      } catch (error) {
        console.log(error);
      }

      // Update quantité en stock si pris en stock
      if (isStock) {
        try {
          const updatedStock = await Stocks.findOneAndUpdate({ ref: job.ref }, { $inc: { ex: -1 } }, { new: true });
          logger.info(`Stock mis à jour pour la référence ${String(job.visuel)} ${job.ref} (1ex déduit)`);
        } catch (error) {
          logger.error(
            `Erreur lors de la mise à jour du stock pour la référence ${String(job.visuel)} ${job.ref}:`,
            error,
          );
        }
      }

      //Générer découpe
      if (job.cut) {
        const pathCutFiles = `./server/public/${sessionPRINTSA}/Cut/`;
        if (!fs.existsSync(pathCutFiles)) {
          fs.mkdirSync(pathCutFiles, { recursive: true });
        }
        const fTauro = job.format_Plaque.split("_").pop();
        const fVisu = job.format_visu.split("_").pop();
        const wPlate = parseFloat(fTauro.toLowerCase().split("x")[0]);
        const hPlate = parseFloat(fTauro.toLowerCase().split("x")[1]);
        const width = parseFloat(fVisu.toLowerCase().split("x")[0]);
        const height = parseFloat(fVisu.toLowerCase().split("x")[1]);

        //Second visuel si CASTO
        const fVisu2 = job.format2_visu.split("_").pop();
        const width2 = parseFloat(fVisu2.toLowerCase().split("x")[0]);
        const height2 = parseFloat(fVisu2.toLowerCase().split("x")[1]);

        // Générer le fichier de découpe pour le client LM
        if (job.client === "LM") {
          try {
            // Créer le fichier de découpe
            createDec(wPlate, hPlate, width, height, pathCutFiles);
            // Générer le fichier de découpe avec les dimensions spécifiées
            generateCutFile(
              hPlate * 10, // hauteur de la plaque en mm
              wPlate * 10, // largeur de la plaque en mm
              height * 10, // hauteur de la visu en mm
              width * 10, // largeur de la visu en mm
              6, // marge de découpe en mm
              pathCutFiles, // chemin du fichier de découpe
            );
          } catch (error) {
            console.log(error);
          }
        }
      }

      // Ajouter la tâche terminée à jobList.completed et la retirer de jobList.jobs
      jobList.completed.push(job);
      broadcastCompletedJob(job);
    }
    logger.info("✅ Tous les jobs ont été traités avec succès.");
    let resultsSummary = [];
    jobList.completed.map((job) => {
      const { cmd, cmd2 } = job;
      resultsSummary.push([cmd, cmd2 > 0 ? cmd2 : ""]);
    });
    logger.info(
      `📊 Résumé des commandes traitées :\n[${resultsSummary.map(([cmd, cmd2]) => `${cmd}${cmd2 ? " + " + cmd2 : ""}`).join(", ")}]`,
    );
    // Supprimer tous les jobs traités de jobList.jobs
    jobList.jobs = jobList.jobs.filter(
      (job) => !jobList.completed.some((completedJob) => completedJob._id === job._id),
    );

    //  Suppression du backup après succès
    try {
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
        logger.info("✔️  Backup supprimé après exécution des jobs");
      }
    } catch (e) {
      logger.error("❌ Impossible de supprimer le backup", e);
    }

    const endTime = performance.now();
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "end", endTime }));
      }
    });

    try {
      const baseFolder = path.join(__dirname, `./public/${sessionPRINTSA}`);
      const tempFolder = path.join(baseFolder, "_tmp");
      const etiquettesFolder = path.join(baseFolder, "Etiquettes");

      // Vérifier et créer les dossiers si nécessaires
      await fs.promises.mkdir(tempFolder, { recursive: true });
      await fs.promises.mkdir(etiquettesFolder, { recursive: true });

      // Générer les étiquettes
      await generateStickers(jobList.completed, tempFolder, true);

      // Chemin du fichier PDF
      const pdfPath = path.join(etiquettesFolder, `${sessionPRINTSA}.pdf`);

      // Générer le PDF
      await createStickersPage(tempFolder, pdfPath, "A4");

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
      logger.error("❌ Erreur lors de la génération des étiquettes :", error);
    }

    res.status(200).json({ message: "Jobs completed successfully" });
  } catch (error) {
    logger.error("Error running jobs:", error);
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
  if (
    typeof decoLM === "string" ||
    typeof decoCASTO === "string" ||
    typeof previewDeco === "string" ||
    typeof decoBRICO === "string"
  ) {
    let jpgFiles = [];
    if (fs.existsSync(previewDeco)) {
      const files = fs.readdirSync(previewDeco, { withFileTypes: true });
      jpgFiles = files.filter((file) => file.isFile() && file.name.endsWith(".jpg"));
    }

    const dirLM = await getFiles(decoLM);
    const dirCASTO = await getFiles(decoCASTO);
    const dirBRICO = await getFiles(decoBRICO);
    const dirDecoPreview = jpgFiles.map((file) => ({
      name: file.name,
      path: path.join(previewDeco, file.name),
    }));

    res.json([
      {
        LM: dirLM,
        CASTO: dirCASTO,
        BRICO: dirBRICO,
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
    logger.error("❌ Erreur lors de la génération des étiquettes :", error);
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
      logger.info(result.message);
    })
    .catch((error) => {
      logger.error("Error:", error);
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
    await processAllPDFs({
      pdfDirectory: path.join(decoCASTO),
      jpgDirectory: path.join(previewDeco),
      height: 1920,
      density: 72,
      parallelLimit: 5,
      verbose: false,
    });
    await processAllPDFs({
      pdfDirectory: path.join(decoBRICO),
      jpgDirectory: path.join(previewDeco),
      height: 1920,
      density: 72,
      parallelLimit: 5,
      verbose: false,
    });
  } catch (error) {
    console.error("Error:", error);
  }
  logger.info(`Server start on port ${PORT}`);
  await mongoose().catch((err) => logger.info(err));
});
