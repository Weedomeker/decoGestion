const { pdftobuffer } = require('pdftopic');
const gm = require('gm').subClass({ imageMagick: true });
const fs = require('fs');
const path = require('path');
const { parentPort, workerData } = require('worker_threads');

// Fonction utilitaire pour générer un buffer avec rectangle
const gmRectangleBuffer = (width, height, rectColor, strokeColor) => {
  return new Promise((resolve, reject) => {
    gm(width, height, '#ffffff') // fond blanc
      .fill(rectColor) // couleur du rectangle
      .stroke(strokeColor, 2) // contour noir, épaisseur 5px
      .drawRectangle(0, 0, width, height) // rectangle avec marge 50px
      .toBuffer('JPEG', (err, buffer) => {
        if (err) {
          return reject(err);
        }
        resolve(buffer);
      });
  });
};

const colors = {
  noir: '#000000',
  blanc: '#ffffff',
  granit: '#808080',
};

const pdfToimg = async (readFile, writeFile) => {
  const regex = new RegExp(`(${Object.keys(colors).join('|')})`, 'gi');
  const match = path.basename(writeFile).match(regex);
  try {
    if (fs.existsSync(readFile)) {
      // --- Cas 1 : PDF existe → conversion ---
      const pdf = fs.readFileSync(readFile);
      const buffer = await pdftobuffer(pdf, 0);
      fs.writeFileSync(writeFile, buffer);
    } else {
      // --- Cas 2 : Pas de PDF → rectangle ---
      const buffer = await gmRectangleBuffer(
        800,
        600,
        match?.[0] ? colors[match?.[0]?.toLowerCase()] : colors.blanc,
        '#000000',
      );
      fs.writeFileSync(writeFile, buffer);
    }

    // Vérification
    if (fs.existsSync(writeFile)) {
      parentPort.postMessage('ok');
    } else {
      parentPort.postMessage('error');
    }
  } catch (error) {
    console.error(error);
    parentPort.postMessage('error');
  }
};

pdfToimg(workerData.pdf, workerData.jpg);
