const path = require("path");
const fs = require("fs");
const getFiles = require("../getFiles").getData;
const { state } = require("./appState");

async function getDecoPaths() {
  const { decoLM, decoCASTO, previewDeco, decoBRICO, decoECOM } = state.paths;

  if (
    typeof decoLM === "string" ||
    typeof decoCASTO === "string" ||
    typeof previewDeco === "string" ||
    typeof decoBRICO === "string" ||
    typeof decoECOM === "string"
  ) {
    let jpgFiles = [];
    if (fs.existsSync(previewDeco)) {
      const files = fs.readdirSync(previewDeco, { withFileTypes: true });
      jpgFiles = files.filter((file) => file.isFile() && file.name.endsWith(".jpg"));
    }

    const dirLM = await getFiles(decoLM);
    const dirCASTO = await getFiles(decoCASTO);
    const dirBRICO = await getFiles(decoBRICO);
    const dirECOM = await getFiles(decoECOM);
    const dirDecoPreview = jpgFiles.map((file) => ({
      name: file.name,
      path: path.join(previewDeco, file.name),
    }));

    return [
      {
        LM: dirLM,
        CASTO: dirCASTO,
        BRICO: dirBRICO,
        ECOM: dirECOM,
        Preview: dirDecoPreview,
      },
    ];
  }

  return { message: "Aucun répertoire valide !" };
}

module.exports = {
  getDecoPaths,
};
