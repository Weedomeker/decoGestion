const { pdftobuffer } = require('pdftopic');
const fs = require('fs');
const path = require('path')


const pdfToimg =  async (readFile, writeFile) => {
    const pdf =  fs.readFileSync(readFile, null);
    let start = performance.now()
    await pdftobuffer(pdf, 0).then((buffer) => {
         fs.writeFileSync(writeFile, buffer, null);
    })
}

module.exports = {pdfToimg};