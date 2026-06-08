const path = require("path");
const fs = require("fs");
const { state } = require("./appState");

function getFormatsTauro() {
  const filePath = path.join(state.paths.serverRoot, "./formatsTauro.conf");

  if (fs.existsSync(filePath)) {
    const readFile = fs.readFileSync(filePath, { encoding: "utf8" });
    const lines = readFile.split(/\r?\n/g).filter((line) => line.trim() !== "");

    return lines.map((v, i) => ({
      id: i,
      value: v,
    }));
  }

  fs.writeFileSync(filePath, "");
  return [];
}

function saveFormatsTauroIfNeeded(formatTauro = []) {
  const filePath = path.join(state.paths.serverRoot, "./formatsTauro.conf");
  let arr = [];

  if (fs.existsSync(filePath)) {
    const readFile = fs.readFileSync(filePath, {
      encoding: "utf8",
    });
    arr.push(readFile.split(/\r?\n/g));
  }

  if (formatTauro.length > arr.length) {
    fs.writeFileSync(filePath, formatTauro.join("\n"));
  }
}

module.exports = {
  getFormatsTauro,
  saveFormatsTauroIfNeeded,
};
