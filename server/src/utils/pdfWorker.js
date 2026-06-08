const path = require("path");
const { Worker } = require("worker_threads");
const { state } = require("../services/appState");

function usePdfWorker(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(state.paths.serverRoot, "./src/pdfToimg.js"), { workerData: data });
    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

module.exports = usePdfWorker;
