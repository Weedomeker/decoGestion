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
const { syncConsommationsHistorique } = require("./src/services/gamesysConsommationSyncService");
const { backfillRecentDecoData } = require("./src/services/startupPrixBackfillService");
const { syncDecoStubsDepuisGamesys } = require("./src/services/decoGamesysStubSyncService");
const { resolveSinceDate, marquerRun } = require("./src/services/backfillWatermarkService");

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

app.get("/admin-theme.css", (req, res) => {
  res.setHeader("Content-Type", "text/css");
  res.sendFile(path.join(__dirname, "src/admin-theme.css"));
});

app.use("/admin/queues", (req, res, next) => {
  const _send = res.send.bind(res);
  res.send = function (body) {
    if (typeof body === "string" && body.includes("</head>")) {
      body = body.replace("</head>", '<link rel="stylesheet" href="/admin-theme.css"></head>');
    }
    return _send(body);
  };
  next();
}, serverAdapter.getRouter());

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
  // checkVersion et linkFolders sont indépendants — on les lance en parallèle
  await Promise.all([
    checkVersion()
      .then((result) => logger.info(result.message))
      .catch((error) => logger.error("Error:", error)),
    linkFolders(false),
  ]);

  // checkNetworkPaths dépend des state.paths peuplés par linkFolders
  await checkNetworkPaths();

  // MongoDB doit être prêt avant processAllPDFs (scan long) pour que les requêtes
  // arrivant pendant le scan ne buffèrent pas et ne timeout pas.
  // ODBC n'a aucune dépendance — on le connecte en parallèle avec MongoDB.
  const [, odbcOk] = await Promise.all([
    connectMongo().catch((err) => logger.error(`MongoDB: ${err.message || err.code || err}`)),
    checkOdbcConnection(),
  ]);
  if (odbcOk) {
    logger.info("ODBC: connexion établie");
  } else {
    logger.warn("ODBC: connexion échouée — API Gamesys indisponible (mode dégradé)");
  }

  logger.info(`Server start on port ${PORT}`);

  const previewDir = state.paths.previewDeco;
  const sourceDirs = [state.paths.decoECOM, state.paths.decoLM, state.paths.decoCASTO, state.paths.decoBRICO];

  if (previewDir) {
    try {
      // Les 4 répertoires source sont indépendants — traitement en parallèle
      await Promise.all(
        sourceDirs.map((pdfDir) => {
          if (!pdfDir) {
            logger.warn("processAllPDFs ignoré: symlink source non disponible");
            return Promise.resolve();
          }
          return processAllPDFs({
            pdfDirectory: pdfDir,
            jpgDirectory: previewDir,
            height: 1920,
            density: 72,
            parallelLimit: 5,
            verbose: false,
          });
        }),
      );
    } catch (error) {
      logger.error("Erreur génération JPG:", error);
    }
  } else {
    logger.warn("processAllPDFs ignoré: dossier preview non disponible");
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

  // Sync récurrente des consommations profils/kits (Gamesys → ConsommationCommande/StockArticle),
  // pour couvrir les commandes qui ne passent jamais par le pipeline normal de jobs decoGestion.
  // Fenêtre glissante (10j) plus large que l'intervalle : rattrape les retards Gamesys sans créer
  // de doublons (syncConsommationsHistorique ignore les numCmd déjà connus).
  const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const SYNC_LOOKBACK_DAYS = 10;
  const SYNC_INITIAL_DELAY_MS = 5 * 60 * 1000;

  setTimeout(() => {
    setInterval(async () => {
      try {
        const sinceDate = new Date(Date.now() - SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
        const resume = await syncConsommationsHistorique({ sinceDate, concurrency: 3 });
        logger.info(
          `Sync Gamesys consommations : ${resume.traites} traitées, ${resume.dejaExistants} déjà connues, ${resume.erreurs} erreurs (sur ${resume.candidats} candidats). ` +
            `Réconciliation stock_profiles : ${resume.orphelinsReconcilies}/${resume.orphelinsDetectes} orphelines corrigées.`,
        );
      } catch (error) {
        logger.warn(`Sync Gamesys consommations échouée : ${error.message}`);
      }
    }, SYNC_INTERVAL_MS);
  }, SYNC_INITIAL_DELAY_MS);

  // Backfill unique au démarrage des prix/date de livraison des commandes récentes ajoutées
  // manuellement dans une autre appli (donc jamais passées par le pipeline Gamesys normal).
  // Fenêtre glissante configurable (défaut 2j) : reste volontairement court pour ne pas alourdir
  // chaque démarrage — les backlogs plus anciens se rattrapent via les scripts CLI manuels.
  const PRIX_BACKFILL_LOOKBACK_DAYS = parseInt(process.env.PRIX_BACKFILL_LOOKBACK_DAYS, 10) || 2;
  const PRIX_BACKFILL_INITIAL_DELAY_MS = 2 * 60 * 1000;

  setTimeout(async () => {
    try {
      const sinceDate = await resolveSinceDate({
        cle: "startupDecoData",
        fenetreDefautJours: PRIX_BACKFILL_LOOKBACK_DAYS,
      });
      await backfillRecentDecoData({ sinceDate });
      await marquerRun("startupDecoData");
      logger.info(`Backfill prix/livraison récents (depuis ${sinceDate.toISOString().slice(0, 10)}) terminé.`);
    } catch (error) {
      logger.warn(`Backfill prix/livraison récents échoué : ${error.message}`);
    }
  }, PRIX_BACKFILL_INITIAL_DELAY_MS);

  // Création proactive au démarrage des stubs Deco (gamesysStub:true) pour les dossiers Gamesys
  // récents qui n'ont pas encore de document Deco — l'utilisateur les réclame ensuite via
  // claimStubOrCreate quand il traite le job normalement. Unique au démarrage (pas de setInterval
  // récurrent comme la sync consommations ci-dessus) : un dossier apparu après ce démarrage n'aura
  // pas de stub avant le prochain redémarrage, sans perte fonctionnelle (repli sur la création
  // classique dans ce cas, cf. claimStubOrCreate).
  const DECO_STUB_SYNC_LOOKBACK_DAYS = parseInt(process.env.DECO_STUB_SYNC_LOOKBACK_DAYS, 10) || 5;
  const DECO_STUB_SYNC_INITIAL_DELAY_MS = 3 * 60 * 1000;

  setTimeout(async () => {
    try {
      const sinceDate = await resolveSinceDate({
        cle: "startupStubSync",
        fenetreDefautJours: DECO_STUB_SYNC_LOOKBACK_DAYS,
      });
      const resume = await syncDecoStubsDepuisGamesys({ sinceDate });
      await marquerRun("startupStubSync");
      logger.info(
        `Sync stubs Deco depuis Gamesys (depuis ${sinceDate.toISOString().slice(0, 10)}) : ${JSON.stringify(resume)}`,
      );
    } catch (error) {
      logger.warn(`Sync stubs Deco échouée : ${error.message}`);
    }
  }, DECO_STUB_SYNC_INITIAL_DELAY_MS);
});
