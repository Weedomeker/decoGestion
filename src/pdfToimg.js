const { pdftobuffer } = require('pdftopic');
const fs = require('fs');
const path = require('path')
const { performance } = require('perf_hooks');


const pdfToimg =  async (readFile, writeFile) => {
    const pdf =  fs.readFileSync(readFile, null);
    let start = performance.now()
    await pdftobuffer(pdf, 0).then((buffer) => {
         fs.writeFileSync(writeFile, buffer, null);
        if(fs.existsSync(writeFile)){
            let timeExec = ((performance.now() - start)/1000).toFixed(2)
            console.log('JPEG Completed in ' + timeExec + ' secs !\n' + path.resolve(writeFile))
        }
    })
}

module.exports = {pdfToimg};