const { pdftobuffer } = require('pdftopic');
const fs = require('fs');
const { parentPort, workerData } = require('worker_threads');

const pdfToimg = async (readFile, writeFile) => {
  const pdf = fs.readFileSync(readFile, null);
  await pdftobuffer(pdf, 0).then((buffer) => {
    fs.writeFileSync(writeFile, buffer, null);
  });
};

pdfToimg(workerData.pdf, workerData.jpg);
parentPort.postMessage('jpg ok');

// module.exports = { pdfToimg };
