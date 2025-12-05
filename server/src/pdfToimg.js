const { pdftobuffer } = require("pdftopic");
const fs = require("fs");
const path = require("path");
const { parentPort, workerData } = require("worker_threads");
const logger = require("./logger/logger");

const pdfToimg = async (readFile, writeFile) => {
  try {
    if (fs.existsSync(readFile)) {
      const pdf = fs.readFileSync(readFile);
      const buffer = await pdftobuffer(pdf, 0);
      fs.writeFileSync(writeFile, buffer);
    }

    // Vérification
    if (fs.existsSync(writeFile)) {
      parentPort.postMessage("ok");
    } else {
      parentPort.postMessage("error");
    }
  } catch (error) {
    logger.error(error);
    parentPort.postMessage("error");
  }
};

pdfToimg(workerData.pdf, workerData.jpg);
