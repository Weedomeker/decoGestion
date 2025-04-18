import { expect } from 'chai';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import Piscina from 'piscina';
import { fileURLToPath } from 'url';

// Définition de __dirname en mode ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dossier de sortie final
const OUTPUT_FINAL_DIR = path.join(__dirname, './output_final');
const logFilePath = path.join(__dirname, 'log_conversion.log'); // Chemin du fichier de log

let WORKER = 'pdfTopic';
const MAX_THREADS = 12;

// Crée le pool de workers
const pool = new Piscina({
  filename: path.resolve(__dirname, './poppler.js'), // Emplacement de ton fichier poppler.js
  maxThreads: MAX_THREADS, // Nombre maximal de threads
});

// Crée le dossier de sortie s'il n'existe pas
if (!fs.existsSync(OUTPUT_FINAL_DIR)) {
  fs.mkdirSync(OUTPUT_FINAL_DIR, { recursive: true });
}

// Fonction pour écrire dans les logs
function writeLog(message) {
  const timestamp = new Date().toLocaleString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  fs.appendFileSync(logFilePath, `${timestamp} - ${message}\n`, 'utf-8');
}

// Fonction de conversion avec le pool de workers
async function convertPdf(pdfFilePath, outputImg, testName, dir, startTime) {
  try {
    // Exécuter la conversion en passant les données au worker
    const result = await pool.run({ pdf: pdfFilePath, jpg: outputImg });

    // Vérifie si le fichier a bien été généré
    const finalPath = path.join(OUTPUT_FINAL_DIR, path.basename(result.file));

    if (fs.existsSync(result.file)) {
      fs.renameSync(result.file, finalPath); // Déplace le fichier
      const elapsedTime = process.hrtime(startTime);
      const executionTimeSec = elapsedTime[0] + elapsedTime[1] / 1e9;

      const fileSizeFormatted = formatSize(fs.statSync(pdfFilePath).size);

      // Log de la conversion réussie
      console.log(
        `[${dir}] ${testName} - Temps: ${executionTimeSec > 10 ? chalk.red(executionTimeSec.toFixed(2)) : chalk.green(executionTimeSec.toFixed(2))} s - Taille: ${fileSizeFormatted}`,
      );
      writeLog(`[${dir}] ${testName} - Temps: ${executionTimeSec.toFixed(2)} s - Taille: ${fileSizeFormatted}`);

      return { success: true, executionTimeSec }; // Retourne le succès et le temps d'exécution
    } else {
      console.error(chalk.red(`❌ ${testName}: Le fichier généré n'existe pas : ${result.file}`));
      writeLog(`${testName}: Erreur - Le fichier généré n'existe pas : ${result.file}`);
      return { success: false };
    }
  } catch (error) {
    const elapsedTime = process.hrtime(startTime);
    const executionTimeSec = elapsedTime[0] + elapsedTime[1] / 1e9;

    console.error(chalk.red(`❌ ${testName}: Erreur : ${error.message}`));
    writeLog(`${testName}: Erreur - ${error.message}`);
    return { success: false, executionTimeSec };
  }
}

// Fonction de test pour la conversion
describe('Tests de conversion PDF -> JPG', function () {
  this.timeout(60000); // Timeout long pour les fichiers lourds

  const PDF_DIR = path.join(__dirname, '../server/public/STANDARDS'); // Dossier contenant les PDFs
  const directories = fs.readdirSync(PDF_DIR).filter((dir) => fs.statSync(path.join(PDF_DIR, dir)).isDirectory());

  let totalFilesConverted = 0;
  let totalStartTime = process.hrtime(); // Start time pour calculer le temps total

  describe('Tests des petits fichiers', function () {
    directories.forEach((dir) => {
      const folderPath = path.join(PDF_DIR, dir);
      const pdfPaths = getSmallestAndLargestPdf(folderPath); // Prend les fichiers les plus petits et les plus grands

      it(`Convertir le fichier le plus petit de ${dir}`, async function () {
        const pdfFilePath = pdfPaths.smallest;
        const outputImg = path.join(OUTPUT_FINAL_DIR, `${path.basename(pdfFilePath, '.pdf')}.jpg`);
        const startTime = process.hrtime(); // Start time pour ce test

        const { success, executionTimeSec } = await convertPdf(
          pdfFilePath,
          outputImg,
          `Petit fichier: ${dir}`,
          dir,
          startTime,
        );
        expect(success).to.equal(true);
        totalFilesConverted++;

        // Log du temps total de ce test
        console.log(chalk.green(`Temps pour ${dir} (Petit fichier) : ${executionTimeSec.toFixed(2)} s`));
        writeLog(`Temps pour ${dir} (Petit fichier) : ${executionTimeSec.toFixed(2)} s`);
      });
    });
  });

  describe('Tests des gros fichiers', function () {
    directories.forEach((dir) => {
      const folderPath = path.join(PDF_DIR, dir);
      const pdfPaths = getSmallestAndLargestPdf(folderPath); // Prend les fichiers les plus petits et les plus grands

      it(`Convertir le fichier le plus grand de ${dir}`, async function () {
        const pdfFilePath = pdfPaths.largest;
        const outputImg = path.join(OUTPUT_FINAL_DIR, `${path.basename(pdfFilePath, '.pdf')}.jpg`);
        const startTime = process.hrtime(); // Start time pour ce test

        const { success, executionTimeSec } = await convertPdf(
          pdfFilePath,
          outputImg,
          `Gros fichier: ${dir}`,
          dir,
          startTime,
        );
        expect(success).to.equal(true);
        totalFilesConverted++;

        // Log du temps total de ce test
        console.log(chalk.green(`Temps pour ${dir} (Gros fichier) : ${executionTimeSec.toFixed(2)} s`));
        writeLog(`Temps pour ${dir} (Gros fichier) : ${executionTimeSec.toFixed(2)} s`);
      });
    });
  });

  // Affichage du résultat final
  after(() => {
    const totalElapsedTime = process.hrtime(totalStartTime); // Temps total d'exécution
    const totalExecutionTimeSec = totalElapsedTime[0] + totalElapsedTime[1] / 1e9;

    console.log(chalk.blue('\n\n========== Résumé de la conversion PDF → JPG ==========\n'));
    console.log(chalk.red('WORKER: '), WORKER === 'poppler' ? 'Poppler' + ` || ${MAX_THREADS} threads` : 'pdfTopic');
    console.log(chalk.blue(`Total des fichiers convertis : ${totalFilesConverted}`));
    console.log(chalk.green(`Fichiers générés dans : ${OUTPUT_FINAL_DIR}`));
    console.log(chalk.magenta(`Temps total d'exécution : ${totalExecutionTimeSec.toFixed(2)} s`));
    console.log(chalk.blue('=======================================================\n'));

    writeLog('\n\n========== Résumé de la conversion PDF → JPG ==========\n');
    writeLog(`WORKER:  ${WORKER === 'poppler'}` ? 'Poppler' + ` || ${MAX_THREADS} threads` : 'pdfTopic');
    writeLog(`Total des fichiers convertis : ${totalFilesConverted}`);
    writeLog(`Fichiers générés dans : ${OUTPUT_FINAL_DIR}`);
    writeLog(`Temps total d'exécution : ${totalExecutionTimeSec.toFixed(2)} s`);
    writeLog('=======================================================\n\n\n\n');
  });
});

// Fonction pour récupérer les plus petits et gros fichiers PDF
function getSmallestAndLargestPdf(folderPath) {
  const files = fs
    .readdirSync(folderPath)
    .filter((file) => file.endsWith('.pdf'))
    .map((file) => ({
      path: path.join(folderPath, file),
      size: fs.statSync(path.join(folderPath, file)).size,
    }));

  if (files.length === 0) return { smallest: null, largest: null };

  files.sort((a, b) => a.size - b.size); // Trie par taille croissante
  return {
    smallest: files[0].path,
    largest: files[files.length - 1].path,
  };
}

// Fonction pour formater la taille des fichiers
function formatSize(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} Go`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} Mo`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(2)} Ko`;
  return `${bytes} octets`;
}
