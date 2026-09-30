const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
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
  // Version de l'appli : build-info.json (écrit au build, seule source en prod) sinon package.json + git.
  app: { version: undefined, commit: null, buildDate: null },
  appVersion: undefined, // alias de app.version (usages historiques)
  networkStatus: { LM: false, CASTO: false, BRICO: false, ECOM: false, PREVIEW: false },
};

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function gitShortCommit(rootDir) {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

// En dev, build-info.json (reste d'un build local) serait périmé : on lit package.json + git.
function loadAppVersion(rootDir = projectRoot, { preferBuildInfo = process.env.NODE_ENV !== "development" } = {}) {
  const buildInfo = preferBuildInfo ? readJson(path.join(rootDir, "build-info.json")) : null;

  if (buildInfo?.version) {
    state.app = {
      version: buildInfo.version,
      commit: buildInfo.commit || null,
      buildDate: buildInfo.buildDate || null,
    };
  } else {
    const packageJson = readJson(path.join(rootDir, "package.json"));
    if (!packageJson) logger.error(`Lecture de package.json impossible dans ${rootDir}`);
    state.app = { version: packageJson?.version, commit: gitShortCommit(rootDir), buildDate: null };
  }

  state.appVersion = state.app.version;
  logger.debug(`Version de l'application: ${state.app.version} (${state.app.commit || "commit inconnu"})`);
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
