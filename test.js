const { pdftobuffer } = require('pdftopic');
const fs = require('fs');
const pdf = fs.readFileSync('./deco/1_120x240CM/DIBOND 125X250-5Galets 120x240_S_.pdf', null);

let start = performance.now()
pdftobuffer(pdf, 0).then((buffer) => {
    fs.writeFileSync('./public/tmp/test.jpg', buffer, null);
    let timeExec = ((performance.now() - start)/1000).toFixed(2)
    console.log(timeExec + ' secs')
})
