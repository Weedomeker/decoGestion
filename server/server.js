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
const { state, loadAppVersion, restoreJobsBackup } = require("./src/services/appState");
const { linkFolders } = require("./src/services/configService");
const { initWebSocket } = require("./src/services/websocketService");
const { checkOdbcConnection, getOdbcStatus } = require("./src/gamesys/config/db");
const mongooseLib = require("mongoose");

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
restoreJobsBackup();
initWebSocket(server);

app.use(cors());
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

  logger.info(`Server start on port ${PORT}`);
  await connectMongo().catch((err) => logger.error(`MongoDB: ${err.message || err.code || err}`));

  const odbcOk = await checkOdbcConnection();
  if (odbcOk) {
    logger.info("ODBC: connexion établie");
  } else {
    logger.warn("ODBC: connexion échouée — API Gamesys indisponible (mode dégradé)");
  }
});
