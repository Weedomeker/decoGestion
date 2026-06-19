require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const path = require("path");
const fs = require("fs");
const http = require("http");
const serveIndex = require("serve-index");
const cors = require("cors");
const morgan = require("morgan");
const logger = require("./src/logger/logger");
const checkVersion = require("./src/checkVersion");
const connectMongo = require("./src/mongoose");
const { processAllPDFs } = require("./src/generatePreview");
const registerRoutes = require("./src/routes");
const { state, loadAppVersion } = require("./src/services/appState");
const { linkFolders } = require("./src/services/configService");
const { initWebSocket, broadcastHealth } = require("./src/services/websocketService");
const { checkOdbcConnection, getOdbcStatus } = require("./src/gamesys/config/db");
const { checkNetworkPaths } = require("./src/services/networkChecker");
const mongooseLib = require("mongoose");
const { createBullBoard } = require("@bull-board/api");
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");
const { ExpressAdapter } = require("@bull-board/express");
const { decoQueue, initWorker } = require("./src/services/queueService");
const { processJob } = require("./src/controllers/jobsController");

const PORT = process.env.PORT || 8000;

process.on("uncaughtException", (err) => {
  logger.error(`Exception non capturée : ${err.stack || err.message}`);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.stack : String(reason);
  logger.error(`Promesse rejetée non gérée : ${msg}`);
});

const app = express();
const server = http.createServer(app);
const accessLogStream = fs.createWriteStream(path.join(__dirname, "server.log"), { flags: "a" });

loadAppVersion();
initWebSocket(server);

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : ["http://localhost:3000", "http://localhost:5173"],
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type"],
  maxAge: 86400,
}));
app.use(express.json());
app.use(cookieParser());
app.use(morgan("combined", { stream: accessLogStream }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

app.use("/public", express.static(__dirname));
app.use("/public/PREVIEW", express.static(path.join(__dirname, "/public/PREVIEW")));
app.use(express.static(path.join(__dirname, "../client/dist")));
app.use(
  "/louis",
  express.static(path.join(__dirname, `/public/${state.paths.sessionPRINTSA}/`)),
  serveIndex(path.join(__dirname, `/public/${state.paths.sessionPRINTSA}/`), { icons: true }),
);
app.use(
  "/qrcode",
  express.static(path.join(__dirname, `/public/${state.paths.sessionPRINTSA}/QRCodes/`)),
  serveIndex(path.join(__dirname, `/public/${state.paths.sessionPRINTSA}/QRCodes/`), {
    icons: true,
  }),
);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

registerRoutes(app);

// Bull Board — dashboard /admin/queues
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [new BullMQAdapter(decoQueue)],
  serverAdapter,
});
app.use("/admin/queues", serverAdapter.getRouter());

// Worker BullMQ — traite les jobs process-job avec processJob
initWorker(async (bullJob) => {
  const { job, sortFolder, ip } = bullJob.data;
  const fakeReq = { body: { sortFolder }, ip };
  await processJob(job, fakeReq);
});

// 404 — doit être après toutes les routes
app.use((req, res) => {
  res.status(404).json({ error: `Route introuvable : ${req.method} ${req.path}` });
});

// Middleware d'erreur global — 4 paramètres obligatoires pour Express
app.use((err, req, res, next) => {
  logger.error(`Erreur non gérée [${req.method} ${req.path}] : ${err.stack || err.message}`);
  res.status(err.status || 500).json({
    error: err.message || "Erreur interne du serveur",
  });
});

server.listen(PORT, async () => {
  await checkVersion()
    .then((result) => {
      logger.info(result.message);
    })
    .catch((error) => {
      logger.error("Error:", error);
    });

  await linkFolders(false);

  await checkNetworkPaths();

  // MongoDB doit être prêt avant processAllPDFs (scan long) pour que les requêtes
  // arrivant pendant le scan ne buffèrent pas et ne timeout pas.
  await connectMongo().catch((err) => logger.error(`MongoDB: ${err.message || err.code || err}`));

  logger.info(`Server start on port ${PORT}`);

  const previewDir = state.paths.previewDeco;
  const sourceDirs = [state.paths.decoECOM, state.paths.decoLM, state.paths.decoCASTO, state.paths.decoBRICO];

  if (previewDir) {
    try {
      for (const pdfDir of sourceDirs) {
        if (pdfDir) {
          await processAllPDFs({
            pdfDirectory: pdfDir,
            jpgDirectory: previewDir,
            height: 1920,
            density: 72,
            parallelLimit: 5,
            verbose: false,
          });
        } else {
          logger.warn("processAllPDFs ignoré: symlink source non disponible");
        }
      }
    } catch (error) {
      logger.error("Erreur génération JPG:", error);
    }
  } else {
    logger.warn("processAllPDFs ignoré: dossier preview non disponible");
  }

  const odbcOk = await checkOdbcConnection();
  if (odbcOk) {
    logger.info("ODBC: connexion établie");
  } else {
    logger.warn("ODBC: connexion échouée — API Gamesys indisponible (mode dégradé)");
  }

  const MONGO_STATES = ["disconnected", "connected", "connecting", "disconnecting"];
  setInterval(async () => {
    const mongoState = MONGO_STATES[mongooseLib.connection.readyState] || "unknown";
    if (mongooseLib.connection.readyState !== 1) {
      logger.warn(`Check périodique : MongoDB ${mongoState}`);
    }

    await checkOdbcConnection();
    const odbcState = getOdbcStatus();
    if (odbcState !== "connected") {
      logger.warn(`Check périodique : ODBC ${odbcState}`);
    }

    await checkNetworkPaths();

    broadcastHealth({
      mongodb: mongoState,
      odbc: odbcState,
      symlinks: state.networkStatus,
      uptime: Math.floor(process.uptime()),
    });
  }, 30_000);
});
