const path = require("path");
const { isProfileLabel, isTeinteMasseModel } = require("../gamesys/utils/reference");

// Formats de référence par client :
//   LM    : 8 chiffres isolés (ex: "94953676") OU alphanumérique avec tiret (ex: "AURALIN-100210")
//           (?<!\d) / (?!\d) empêchent d'extraire 8 chiffres au milieu d'un EAN-13 CASTO.
//   CASTO : EAN-13 strictement 13 chiffres isolés — mêmes garde-fous que LM.
//   BRICO / ECOM : lettres + tiret + chiffres SANS "x" (ex: "VELTIS-25560", "CALACA-100255").
//           \d+ ne capture jamais "x", donc le format sans séparateur est garanti par construction.
const REF_REGEX_BY_CLIENT = {
  LM: /(?<!\d)\d{8}(?!\d)|[A-Z]+\d*-\d+/,
  CASTO: /(?<!\d)\d{13}(?!\d)/,
  BRICO: /[A-Z]+\d*-\d+/,
  ECOM: /[A-Z]+\d*-\d+/,
};

// Validation stricte du format de la référence extraite (patterns ancrés début/fin).
// Empêche les faux positifs avant la requête MongoDB.
const REF_FORMAT_BY_CLIENT = {
  LM: /^(\d{8}|[A-Z]+\d*-\d{4,})$/,
  CASTO: /^\d{13}$/,
  BRICO: /^[A-Z]+\d*-\d{4,}$/,
  ECOM: /^[A-Z]+\d*-\d{4,}$/,
};

// Messages d'aide affichés dans les erreurs 400 REF_FORMAT_INVALID.
const REF_FORMAT_HINT = {
  LM: "8 chiffres (ex: 94953676) ou alphanumérique sans 'x' (ex: AURALIN-100210)",
  CASTO: "EAN-13 — exactement 13 chiffres (ex: 3664711694254)",
  BRICO: "lettres + chiffres sans 'x' (ex: VELTIS-25560, CALACA-100255)",
  ECOM: "lettres + chiffres sans 'x' (ex: HOKUSAID-100210)",
};

function validateRefFormat(ref, client) {
  const regex = REF_FORMAT_BY_CLIENT[client];
  if (!regex) return true;
  return regex.test(ref);
}

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
  REF_FORMAT_BY_CLIENT,
  REF_FORMAT_HINT,
  extractRefFromFilename,
  extractFormatFromFilename,
  validateRefFormat,
  buildFileEntries,
  compareClientReferences,
  checkAllClients,
};
