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
const mongoose = require("./src/mongoose");
const { processAllPDFs } = require("./src/generatePreview");
const registerRoutes = require("./src/routes");
const { state, loadAppVersion, restoreJobsBackup } = require("./src/services/appState");
const { linkFolders } = require("./src/services/configService");
const { initWebSocket } = require("./src/services/websocketService");

const PORT = process.env.PORT || 8000;
const app = express();
const server = http.createServer(app);
const accessLogStream = fs.createWriteStream(path.join(__dirname, "server.log"), { flags: "a" });

loadAppVersion();
restoreJobsBackup();
linkFolders(false);
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
      pdfDirectory: path.join(state.paths.decoECOM),
      jpgDirectory: path.join(state.paths.previewDeco),
      height: 1920,
      density: 72,
      parallelLimit: 5,
      verbose: false,
    });
    await processAllPDFs({
      pdfDirectory: path.join(state.paths.decoLM),
      jpgDirectory: path.join(state.paths.previewDeco),
      height: 1920,
      density: 72,
      parallelLimit: 5,
      verbose: false,
    });
    await processAllPDFs({
      pdfDirectory: path.join(state.paths.decoCASTO),
      jpgDirectory: path.join(state.paths.previewDeco),
      height: 1920,
      density: 72,
      parallelLimit: 5,
      verbose: false,
    });
    await processAllPDFs({
      pdfDirectory: path.join(state.paths.decoBRICO),
      jpgDirectory: path.join(state.paths.previewDeco),
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
