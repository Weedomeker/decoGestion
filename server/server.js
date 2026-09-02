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
const { backfillRecentDecoData } = require("./src/services/startupPrixBackfillService");
const { syncGamesysExtraction } = require("./src/services/gamesysExtractionSyncService");
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

// Exécute une tâche de rattrapage bornée par watermark (cf. backfillWatermarkService) : sinceDate
// = depuis le dernier run réussi (- marge) ou fenêtre défaut au 1er run / après une longue coupure
// serveur. Le watermark n'avance que si isSuccess(resume) est vrai, pour ne jamais perdre de
// fenêtre sur un échec partiel ou total (ODBC coupé pendant le run, etc.).
async function runWatermarkedCatchup({ cle, label, fenetreDefautJours, run, isSuccess }) {
  try {
    const sinceDate = await resolveSinceDate({ cle, fenetreDefautJours });
    const resume = await run(sinceDate);
    const depuis = sinceDate.toISOString().slice(0, 10);
    if (isSuccess(resume)) {
      await marquerRun(cle);
      logger.info(`${label} (depuis ${depuis}) : ${JSON.stringify(resume)}`);
    } else {
      logger.warn(`${label} (depuis ${depuis}) : échec — watermark non avancé : ${JSON.stringify(resume)}`);
    }
  } catch (error) {
    logger.warn(`${label} échoué : ${error.message}`);
  }
}

// Unique au démarrage, après un délai initial (pas de répétition). Tous les jobs de rattrapage sont
// actuellement one-shot (décision explicite pour un mécanisme unique et simple) — un job récurrent
// se réduirait à `setTimeout(() => { runWatermarkedCatchup(opts); setInterval(...) }, ...)` si besoin.
function scheduleWatermarkedStartupRun(opts) {
  setTimeout(() => runWatermarkedCatchup(opts), opts.initialDelayMs);
}

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

  // Extraction Gamesys unifiée des commandes récentes — fusionne ce que faisaient séparément la sync
  // consommations (ConsommationCommande pour les profils/kits jamais recherchés manuellement dans
  // l'UI, faute de visuel associé) et la création proactive de stubs Deco (gamesysStub:true,
  // "A lancer", consommés par une appli externe AVANT tout traitement decoGestion) — cf.
  // gamesysExtractionSyncService.js. Un seul scan Gamesys (listCommandesRecentes) et, par commande
  // candidate, un seul aller-retour Gamesys (fetchDossierGroupedDetail, connexion réutilisée pour
  // toute la commande) au lieu de deux à trois séparément. Unique au démarrage (pas de récurrence,
  // décision explicite pour garder un mécanisme unique et simple) : une commande apparue après ce
  // démarrage sera rattrapée au prochain redémarrage — repli sur les chemins normaux entre-temps
  // (claimStubOrCreate pour les stubs, recherche manuelle du dossier pour les profils/kits).
  // Délai court (30s, pas de justification technique forte) : laisse le temps au scan PDF/health
  // check initial de se caler, sans faire attendre plusieurs minutes un travail qui, une fois lancé,
  // ne prend que quelques secondes (mesuré en prod : ~7s pour 47 candidats). Décalé de 15s après le
  // backfill prix/livraison ci-dessous pour ne pas cumuler leurs connexions ODBC en même temps.
  const GAMESYS_EXTRACTION_LOOKBACK_DAYS = parseInt(process.env.GAMESYS_EXTRACTION_LOOKBACK_DAYS, 10) || 5;
  const GAMESYS_EXTRACTION_INITIAL_DELAY_MS = 30 * 1000;

  scheduleWatermarkedStartupRun({
    cle: "startupGamesysExtraction",
    label: "Extraction Gamesys unifiée (stubs Deco + consommations)",
    fenetreDefautJours: GAMESYS_EXTRACTION_LOOKBACK_DAYS,
    initialDelayMs: GAMESYS_EXTRACTION_INITIAL_DELAY_MS,
    run: (sinceDate) => syncGamesysExtraction({ sinceDate, concurrency: 3 }),
    // Échec total = coupure Gamesys pendant tout le run ; les échecs partiels restent tolérés
    // (candidats idempotents, rattrapés au prochain démarrage).
    isSuccess: (resume) => !resume || resume.candidats === 0 || resume.erreurs < resume.candidats,
  });

  // Backfill unique au démarrage des prix/date de livraison des commandes récentes ajoutées
  // manuellement dans une autre appli (donc jamais passées par le pipeline Gamesys normal).
  // Fenêtre glissante configurable (défaut 2j) : reste volontairement court pour ne pas alourdir
  // chaque démarrage — les backlogs plus anciens se rattrapent via les scripts CLI manuels.
  // Délai court (15s, même logique que GAMESYS_EXTRACTION_INITIAL_DELAY_MS ci-dessus) : le travail
  // réel une fois lancé est rapide, pas besoin de plusieurs minutes d'attente.
  const PRIX_BACKFILL_LOOKBACK_DAYS = parseInt(process.env.PRIX_BACKFILL_LOOKBACK_DAYS, 10) || 2;
  const PRIX_BACKFILL_INITIAL_DELAY_MS = 15 * 1000;

  scheduleWatermarkedStartupRun({
    cle: "startupDecoData",
    label: "Backfill prix/livraison récents",
    fenetreDefautJours: PRIX_BACKFILL_LOOKBACK_DAYS,
    initialDelayMs: PRIX_BACKFILL_INITIAL_DELAY_MS,
    run: (sinceDate) => backfillRecentDecoData({ sinceDate }),
    // Succès seulement si AUCUNE phase n'a échoué en bloc (runStep renvoie null sur exception dans
    // startupPrixBackfillService). La synthèse (resultats.synthese) est exclue : son échec est
    // rattrapé par le repli fetchDossier* de chaque phase, le run reste valide.
    isSuccess: (resultats) =>
      [
        resultats.consommationPrix,
        resultats.pkOnlyPrixTotal,
        resultats.decoLivraisonDates,
        resultats.decoPrix,
        resultats.decoPrixVisuel,
        resultats.decoCommandeInfo,
      ].every((p) => p != null),
  });

});
