const path = require("path");
const { isProfileLabel, isTeinteMasseModel } = require("../gamesys/utils/reference");

// LM utilise deux formats de référence :
//   - 8 chiffres (ex: "94953676") pour les anciens articles
//   - alphanumérique avec tiret (ex: "AURALIN-100210", "U548-100210") pour les articles récents
// \d* entre [A-Z]+ et - permet de capturer des refs comme "U548-100210" (lettre+chiffres+tiret+chiffres).
// L'alternance essaie d'abord \d{8} pour ne pas capturer un fragment de format
// (100210 = 6 chiffres seulement, donc pas de faux positif).
const REF_REGEX_BY_CLIENT = {
  LM: /\d{8}|[A-Z]+\d*-\d+/,
  CASTO: /\d{13}/,
  BRICO: /[A-Z]+\d*-\d+/g,
  ECOM: /[A-Z]+\d*-\d+/g,
};

function extractRefFromFilename(fileName, client) {
  const regex = REF_REGEX_BY_CLIENT[client] || REF_REGEX_BY_CLIENT.LM;
  return fileName.match(regex)?.[0] || null;
}

function extractFormatFromFilename(fileName) {
  // Le "x" séparateur est parfois saisi en majuscule sur les fichiers ("100X210") —
  // on normalise en minuscule à l'extraction pour que la comparaison avec la base
  // (compareClientReferences) ne déclenche pas une fausse incohérence de casse.
  return fileName.match(/\d{2,}x\d{2,}/i)?.[0]?.toLowerCase() || null;
}

function normalizeFormat(format) {
  return format ? String(format).toLowerCase() : format;
}

function buildFileEntries(filePaths, client) {
  return filePaths.map((filePath) => {
    const fileName = path.basename(filePath);
    return {
      filePath,
      fileName,
      ref: extractRefFromFilename(fileName, client),
      format: extractFormatFromFilename(fileName),
      client,
    };
  });
}

function compareClientReferences(fileEntries, dbRefs, client) {
  const dbRefMap = new Map(dbRefs.map((doc) => [String(doc.ref), doc]));
  const fileRefsCovered = new Set();

  const orphanFiles = [];
  const formatMismatches = [];

  for (const entry of fileEntries) {
    if (!entry.ref) {
      orphanFiles.push({ ...entry, extractionFailed: true });
      continue;
    }

    const dbRef = dbRefMap.get(entry.ref);
    if (!dbRef) {
      orphanFiles.push({ ...entry, extractionFailed: false });
      continue;
    }

    fileRefsCovered.add(entry.ref);

    if (entry.format && dbRef.format && entry.format !== normalizeFormat(dbRef.format)) {
      formatMismatches.push({
        ref: entry.ref,
        fileName: entry.fileName,
        fileFormat: entry.format,
        dbFormat: dbRef.format,
        client,
      });
    }
  }

  const missingFiles = dbRefs
    .filter((doc) => !fileRefsCovered.has(String(doc.ref)))
    .filter((doc) => !isProfileLabel(doc.model) && !isTeinteMasseModel(doc.model))
    .map((doc) => ({ ref: doc.ref, model: doc.model, format: doc.format, client }));

  return {
    orphanFiles,
    missingFiles,
    formatMismatches,
    stats: {
      filesScanned: fileEntries.length,
      refsInDb: dbRefs.length,
      orphanCount: orphanFiles.length,
      missingCount: missingFiles.length,
      mismatchCount: formatMismatches.length,
    },
  };
}

function checkAllClients(filesByClient, dbRefsByClient) {
  const report = {};
  for (const client of Object.keys(filesByClient)) {
    const fileEntries = buildFileEntries(filesByClient[client], client);
    const dbRefs = dbRefsByClient[client] || [];
    report[client] = compareClientReferences(fileEntries, dbRefs, client);
  }
  return report;
}

module.exports = {
  REF_REGEX_BY_CLIENT,
  extractRefFromFilename,
  extractFormatFromFilename,
  buildFileEntries,
  compareClientReferences,
  checkAllClients,
};
