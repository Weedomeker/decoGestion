const path = require('path');
const fs = require('fs');

const getFiles = (dir, files = [], directories = []) => {
  const fileList = fs.readdirSync(dir);
  for (const file of fileList) {
    const name = `${dir}\\${file}`;
    if (fs.statSync(name).isDirectory() && !fs.readdirSync(name).length == 0) {
      directories.push(path.join(name));
      getFiles(path.join(name), files);
    } else {
      if (path.extname(name) === '.pdf') files.push(name);
    }
  }
  return { directories, files };
};

function bytesToSize(bytes) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return 'n/a';
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
  if (i === 0) return `${bytes} ${sizes[i]})`;
  return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
}

const getData = (dir) => {
  const arr = [];
  getFiles(dir).directories.map((path) => {
    const nameFolder = path.split('\\').pop().slice(2, -2);
    const listFiles = getFiles(path).files.map((file) => file.replace(/\\/g, '/'));
    const sizeFile = listFiles.map((el) => {
      const size = fs.statSync(el).size;
      return bytesToSize(size);
    });
    arr.push({
      name: nameFolder.toLowerCase(),
      path: path.replace(/\\/g, '/') + '/',
      files: listFiles.map((el) => el.replace(/\\/g, '/')),
      sizeFiles: sizeFile,
    });
  });
  return arr;
};

module.exports = { getData };
