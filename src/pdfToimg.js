const { pdftobuffer } = require('pdftopic');
const fs = require('fs');
const { parentPort, workerData } = require('worker_threads');

const pdfToimg = async (readFile, writeFile) => {
  const pdf = fs.readFileSync(readFile, null);
  await pdftobuffer(pdf, 0).then((buffer) => {
    fs.writeFileSync(writeFile, buffer, null);
  });
  const fileExist = fs.existsSync(writeFile);
  if (fileExist) {
    parentPort.postMessage('ok');
  } else {
    return;
  }
};
pdfToimg(workerData.pdf, workerData.jpg);
