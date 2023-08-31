const path = require ("path");
const fs = require ('fs');
    const getFiles = (dir, files = [], directories = []) => {
  const fileList = fs.readdirSync(dir)
  for (const file of fileList) {
    const name = (`${dir}\\${file}`);
    if (fs.statSync(name).isDirectory() && !fs.readdirSync(name).length == 0) {
      directories.push(path.resolve(name))
      getFiles(path.join(name), files);
    } else {
      if(path.extname(name) === ".pdf")
      files.push(name);
  }
}
return {directories, files}
}


let newpath = (String.raw `\\NASSYNORS1221\agence\1-décokin\DECO-K-IN\01 SALLE DE BAIN\01 REF LEROY MERLIN`)
const data = getFiles(newpath)
const nameObj = []
data.directories.slice(1,-3).map((path) => {
const nameFolder = path.split('\\').pop().slice(2,-2)
const listFiles = getFiles(path).files.map(file => file.replace(/\\/g, '/'))
 nameObj.push({name: nameFolder.toLowerCase(), path: path.replace(/\\/g, '/') + '/', files: listFiles.map(el => el.split('/').pop())
})
})




function search(format){
  for (let i=0; i < nameObj.length; i++) {
      if (nameObj[i].name === format) {
          return nameObj[i];
      }
  }
}

module.exports = {nameObj, search, getFiles}


