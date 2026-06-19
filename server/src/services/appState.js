const path = require("path");
const fs = require("fs");
const logger = require("../logger/logger");

const dayDate = new Date()
  .toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
  .replace(".", "")
  .toLocaleUpperCase();

const serverRoot = path.join(__dirname, "../..");
const projectRoot = path.join(serverRoot, "..");

const state = {
  paths: {
    decoECOM: "",
    decoLM: "",
    decoCASTO: "",
    decoBRICO: "",
    previewDeco: "",
    jpgPath: "./server/public",
    sessionPRINTSA: `PRINTSA#${dayDate}`,
    saveFolder:
      process.env.NODE_ENV === "development"
        ? path.join(serverRoot, "/public/tmp")
        : path.join(serverRoot, "/public/TAURO"),
    serverRoot,
    projectRoot,
  },
  process: {
    fileName: "",
    fileName2: "",
    writePath: "",
    jpgName: "",
    jpgName2: "",
    pdfTime: undefined,
    jpgTime: undefined,
  },
  jobs: {
    jobs: [],
    completed: [],
  },
  appVersion: undefined,
  networkStatus: { LM: false, CASTO: false, BRICO: false, ECOM: false, PREVIEW: false },
};

function loadAppVersion() {
  const packageJsonPath = path.join(projectRoot, "package.json");

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    state.appVersion = packageJson.version;
    logger.info("Version de l'application: " + state.appVersion);
  } catch (err) {
    logger.error("Erreur lors de la lecture du fichier package.json: ", err);
  }
}

function updateSourcePath(key) {
  switch (key) {
    case "ECOM":
      state.paths.decoECOM = `./server/public/${key}`;
      break;
    case "LM":
      state.paths.decoLM = `./server/public/${key}`;
      break;
    case "CASTO":
      state.paths.decoCASTO = `./server/public/${key}`;
      break;
    case "BRICO":
      state.paths.decoBRICO = `./server/public/${key}`;
      break;
    case "preview":
      state.paths.previewDeco = `./server/public/${key}`;
      break;
    default:
      break;
  }
}

module.exports = {
  state,
  loadAppVersion,
  updateSourcePath,
};
