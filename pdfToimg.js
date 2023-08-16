const { pdftobuffer } = require('pdftopic');
const fs = require('fs');
let fileExist = false


const pdfToimg =  async (readFile, writeFile) => {
    const pdf =  fs.readFileSync(readFile, null);
    let start = performance.now()
    await pdftobuffer(pdf, 0).then((buffer) => {
         fs.writeFileSync(writeFile, buffer, null);
        if(fs.existsSync(writeFile))
         fileExist = true
        let timeExec = ((performance.now() - start)/1000).toFixed(2)
        console.log(writeFile + '\n Execute time: ' + timeExec + ' secs')
    })
console.log('File Exist: ',fileExist)
}

module.exports = {pdfToimg, fileExist};