const Piscina = require("piscina");
const os = require("os");
const path = require("path");
const { state } = require("../services/appState");

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Piscina({
      filename: path.join(state.paths.serverRoot, "./src/pdfToimg.js"),
      minThreads: 1,
      maxThreads: Math.max(2, os.cpus().length - 1),
    });
  }
  return pool;
}

function usePdfWorker(data) {
  return getPool().run(data);
}

module.exports = usePdfWorker;
