const { pdftobuffer } = require('pdftopic');
const fs = require('fs');
const { parentPort, workerData } = require('worker_threads');

const pdfToimg = async (readFile, writeFile) => {
  try {
    const pdf = fs.readFileSync(readFile);
    const buffer = await pdftobuffer(pdf, 0);
    fs.writeFileSync(writeFile, buffer);
    if (fs.existsSync(writeFile)) {
      parentPort.postMessage('ok');
    } else {
      parentPort.postMessage('error');
    }
  } catch (error) {
    parentPort.postMessage('error');
  }
};

pdfToimg(workerData.pdf, workerData.jpg);
