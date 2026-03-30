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
    } else {
      logger.error("PDF introuvable pour la conversion en image.");
    }

    // Vérification
    if (fs.existsSync(writeFile)) {
      parentPort.postMessage("ok");
      logger.info("Image génerée avec success");
    } else {
      parentPort.postMessage("error");
    }
  } catch (error) {
    logger.error(error);
    parentPort.postMessage("error");
  }
};

pdfToimg(workerData.pdf, workerData.jpg);

//54542 CASTO LILLE 255x60 BETON CLAIR MAT 1_EX + 54542 CASTO LILLE 255x60 BOIS DORE MAT 1_EX.pdf
//54542 CASTO LILLE 255x60 BETON CLAIR MAT 1_EX  + 54542 CASTO LILLE 255x60 BOIS DORE MAT 1_EX.pdf
