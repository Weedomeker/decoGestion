const path = require ("path");
const fs = require ('fs');

    const getFiles = (dir, files = [], directories = []) => {
  const fileList = fs.readdirSync(dir);
  for (const file of fileList) {
    const name = path.join(`${dir}/${file}`);
    if (fs.statSync(name).isDirectory()) {
    directories.push(path.join(__dirname, name))
      getFiles(path.join(name), files);
    } else {
      if(path.extname(name) === ".pdf")
      files.push(path.join(__dirname, name));
        }
  }
   return {directories, files}
}


const test = getFiles('./public/deco')
const nameObj = []
const pathSplit = test.directories.map(elements => {
const strSplit = elements.split('\\').pop().slice(2)
 nameObj.push({[strSplit]: elements})
})
console.log(nameObj)