const path = require("path");
const fs = require("fs");
const { PDFDocument } = require("pdf-lib");
const { cmToPoints, pointsToCm } = require("./convertUnits");

const getFiles = (dir, files = [], directories = []) => {
  const fileList = fs.readdirSync(dir);
  for (const file of fileList) {
    const name = `${dir}\\${file}`;
    if (fs.statSync(name).isDirectory() && fs.readdirSync(name).length !== 0) {
      directories.push(path.join(name));
      getFiles(path.join(name), files);
    } else {
      if (path.extname(name) === ".pdf") files.push(name);
    }
  }
  return { directories, files };
};

// async function getFormat(file) {
//   const format = [];
//   try {
//     const readPdf = await fs.promises.readFile(file);
//     const pdfDoc = await PDFDocument.load(readPdf);
//     const pages = pdfDoc.getPages();
//     const firstPage = pages[0];
//     const { width, height } = firstPage.getSize();
//     format.push(parseInt(pointsToCm(width).toFixed(0)), parseInt(pointsToCm(height).toFixed(0)));
//   } catch (error) {
//     console.log(error);
//   }
//   return format;
// }

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
        const fileSize = fs.statSync(file).size;
        // const format = await getFormat(file);
        return {
          name: file.replace(/\\/g, "/"),
          size: bytesToSize(fileSize),
          // format: format,
        };
      }),
    );

    arr.push({
      name: nameFolder,
      path: folderPath.replace(/\\/g, "/") + "/",
      files: listFiles,
    });
  }

  return arr;
};

module.exports = { getData };
