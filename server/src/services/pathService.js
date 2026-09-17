const path = require("path");
const fs = require("fs");
const getFiles = require("../getFiles").getData;
const { state } = require("./appState");
const logger = require("../logger/logger");

async function safeGetFiles(dir, key) {
  if (!state.networkStatus[key]) return [];
  try {
    return await getFiles(dir);
  } catch (err) {
    logger.warn(`getDecoPaths [${key}] inaccessible : ${err.code || err.message}`);
    return [];
  }
}

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
    if (state.networkStatus.PREVIEW && fs.existsSync(previewDeco)) {
      try {
        const files = fs.readdirSync(previewDeco, { withFileTypes: true });
        jpgFiles = files.filter((file) => file.isFile() && file.name.endsWith(".jpg"));
      } catch (err) {
        logger.warn(`getDecoPaths [PREVIEW] inaccessible : ${err.code || err.message}`);
      }
    }

    const [dirLM, dirCASTO, dirBRICO, dirECOM] = await Promise.all([
      safeGetFiles(decoLM, "LM"),
      safeGetFiles(decoCASTO, "CASTO"),
      safeGetFiles(decoBRICO, "BRICO"),
      safeGetFiles(decoECOM, "ECOM"),
    ]);

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
