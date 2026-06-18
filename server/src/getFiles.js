const path = require("path");
const fs = require("fs");
const { PDFDocument } = require("pdf-lib");
const { cmToPoints, pointsToCm } = require("./convertUnits");

const getFiles = (dir, files = [], directories = []) => {
  if (!fs.existsSync(dir)) return { directories, files };

  try {
    const fileList = fs.readdirSync(dir);
    for (const file of fileList) {
      const name = `${dir}\\${file}`;
      try {
        if (fs.statSync(name).isDirectory() && fs.readdirSync(name).length !== 0) {
          directories.push(path.join(name));
          getFiles(path.join(name), files);
        } else {
          if (path.extname(name) === ".pdf") files.push(name);
        }
      } catch (entryErr) {
        console.warn(`[getFiles] Entrée inaccessible ${name}: ${entryErr.code || entryErr.message}`);
      }
    }
  } catch (err) {
    console.warn(`[getFiles] Erreur lecture ${dir}: ${err.code || err.message}`);
  }
  return { directories, files };
};

function bytesToSize(bytes) {
  const sizes = ["Octets", "Ko", "Mo", "Go", "To"];
  if (bytes === 0) return "n/a";
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
  if (i === 0) return `${bytes} ${sizes[i]}`;
  return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
}

const getData = async (dir) => {
  const arr = [];
  const { directories } = getFiles(dir);

  for (const folderPath of directories) {
    let nameFolder = folderPath.split("\\").pop();

    const listFiles = await Promise.all(
      getFiles(folderPath).files.map(async (file) => {
        try {
          const fileSize = fs.statSync(file).size;
          return {
            name: file.replace(/\\/g, "/"),
            size: bytesToSize(fileSize),
          };
        } catch (err) {
          console.warn(`[getData] Fichier inaccessible ${file}: ${err.code || err.message}`);
          return null;
        }
      }),
    );

    arr.push({
      name: nameFolder,
      path: folderPath.replace(/\\/g, "/") + "/",
      files: listFiles.filter(Boolean),
    });
  }

  return arr;
};

module.exports = { getData, getFiles };
