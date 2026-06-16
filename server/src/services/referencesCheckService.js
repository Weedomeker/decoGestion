const path = require("path");

// LM utilise des références à 8 chiffres en base (ex: "94953676"), distinctes des
// EAN-13 de CASTO — contrairement à jobsController.js (matchRef) qui réutilise par
// défaut /\d{13}/ pour les deux et ne matche donc jamais les vraies refs LM.
const REF_REGEX_BY_CLIENT = {
  LM: /\d{8}/,
  CASTO: /\d{13}/,
  BRICO: /[A-Z]+-\d+/g,
  ECOM: /[A-Z]+-\d+/g,
};

function extractRefFromFilename(fileName, client) {
  const regex = REF_REGEX_BY_CLIENT[client] || REF_REGEX_BY_CLIENT.LM;
  return fileName.match(regex)?.[0] || null;
}

function extractFormatFromFilename(fileName) {
  return fileName.match(/\d{2,}x\d{2,}/i)?.[0] || null;
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

    if (entry.format && dbRef.format && entry.format !== dbRef.format) {
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
  extractRefFromFilename,
  extractFormatFromFilename,
  buildFileEntries,
  compareClientReferences,
  checkAllClients,
};
