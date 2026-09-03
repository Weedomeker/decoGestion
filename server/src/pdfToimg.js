const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const logger = require("./logger/logger");

// GraphicsMagick — même moteur que la génération d'aperçus au démarrage
// (server/src/generatePreview.js via pdf2pic, qui utilise `gm` sans ImageMagick).
// On l'appelle ici en direct plutôt que via pdf2pic : la sémantique de resize de
// pdf2pic (flag "^" / minimum) déforme ou fait exploser la taille des panneaux
// paysage (crédences amalgamées ~5:1), là où `gm convert -resize 2400` tient la
// plus grande dimension à 2400 en préservant le ratio.
const GM_BIN = process.env.GM_BIN || "gm";

// Bride le cache pixel de GraphicsMagick : au-delà, il déborde sur disque au lieu
// d'avorter en mémoire sur les gros PDF amalgamés (crédences ~300 Mo).
// Surchargeable via env (ex: GM_LIMIT_MEMORY=1GiB).
const GM_LIMITS = [
  "-limit",
  "memory",
  process.env.GM_LIMIT_MEMORY || "512MiB",
  "-limit",
  "map",
  process.env.GM_LIMIT_MAP || "1GiB",
  "-limit",
  "disk",
  process.env.GM_LIMIT_DISK || "4GiB",
];

// Garde-fou : au-delà, on tue `gm` (un PDF qui bloque Ghostscript pendait
// jusqu'ici indéfiniment). Surchargeable via GM_TIMEOUT_MS.
const GM_TIMEOUT_MS = Number(process.env.GM_TIMEOUT_MS) || 5 * 60 * 1000;

function runGm(args) {
  return new Promise((resolve, reject) => {
    execFile(
      GM_BIN,
      args,
      { timeout: GM_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr;
          error.stdout = stdout;
          return reject(error);
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

const pdfToimg = async (readFile, writeFile) => {
  if (!fs.existsSync(readFile)) {
    throw new Error(`PDF introuvable pour la conversion en image : ${readFile}`);
  }

  // Pipeline équivalent à l'ancien (fond blanc, aplati, 1re page, plus grande
  // dimension ramenée à 2400 px), mais :
  //  - lecture du PDF par chemin (plus de buffer de plusieurs centaines de Mo en RAM),
  //  - sortie écrite directement dans le fichier cible (vrai JPEG),
  //  - stderr de GraphicsMagick/Ghostscript capturé et journalisé (avant : avalé
  //    par le handler bugué de pdftopic → « this.listeners is not a function »).
  const args = [
    "convert",
    ...GM_LIMITS,
    "-density",
    process.env.GM_DENSITY || "72",
    "-background",
    "white",
    `${readFile}[0]`,
    "-flatten",
    "-resize",
    "2400",
    "-strip",
    "-quality",
    "85",
    writeFile,
  ];

  logger.info(`${GM_BIN} ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ")}`);

  try {
    const { stderr } = await runGm(args);
    if (stderr && stderr.trim()) {
      logger.warn(`gm — avertissements sur ${path.basename(readFile)} : ${stderr.trim()}`);
    }
  } catch (error) {
    const details = [
      error.killed ? `tué après timeout (${GM_TIMEOUT_MS} ms)` : null,
      error.code !== undefined && error.code !== null ? `code=${error.code}` : null,
      error.signal ? `signal=${error.signal}` : null,
      error.stderr && error.stderr.trim() ? `stderr: ${error.stderr.trim()}` : null,
      !error.stderr || !error.stderr.trim() ? `message: ${error.message}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    logger.error(`❌ gm convert a échoué : ${readFile} → ${writeFile} | ${details}`);

    // Nettoie un éventuel fichier partiel / 0 octet laissé par `gm`.
    try {
      if (fs.existsSync(writeFile) && fs.statSync(writeFile).size === 0) fs.unlinkSync(writeFile);
    } catch {
      /* best effort */
    }

    throw new Error(`Échec de la conversion PDF→JPG (gm) : ${details}`);
  }

  if (!fs.existsSync(writeFile) || fs.statSync(writeFile).size === 0) {
    throw new Error(`Échec de la génération de l'image JPG : ${writeFile}`);
  }

  logger.info(`Image générée avec succès : ${path.basename(writeFile)} (${fs.statSync(writeFile).size} octets)`);
};

module.exports = async ({ pdf, jpg }) => {
  await pdfToimg(pdf, jpg);
};
