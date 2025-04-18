// const fs = require('fs');
// const path = require('path');
// const { fromPath } = require('pdf2pic');
// const pLimit = require('p-limit');

import cliProgress from 'cli-progress';
import fs from 'fs';
import pLimit from 'p-limit';
import path from 'path';
import { fromPath } from 'pdf2pic';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to send logs to the terminal
function sendLog(message, verbose = true) {
  if (verbose) {
    console.log(message, '\n');
  }
}

// Function to create and start the progress bar
function createProgressBar(totalFiles) {
  const progressBar = new cliProgress.SingleBar(
    {
      format: '📄 {bar} {percentage}% | {value}/{total} PDFs | 🖼️ {generated} | ✅ {skipped} | ❌ {failure}\n',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      clearOnComplete: true,
      autopadding: true,
    },
    cliProgress.Presets.shades_classic,
  );

  progressBar.start(totalFiles, 0, { generated: 0, skipped: 0, failure: 0 });
  return progressBar;
}

// 🔹 Extract the reference number from the filename
function extractReference(filename) {
  const regex = /\b\d{7,}\b/;
  const match = filename.match(regex);
  return match ? match[0] : null;
}

// 🔹 Recursively find all PDFs
async function findAllPDFs(directory) {
  let files = [];

  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await findAllPDFs(fullPath);
      files = files.concat(subFiles);
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.pdf') {
      files.push(fullPath);
    }
  }
  return files;
}

// 🔹 Process a single PDF
async function processSinglePDF(pdfPath, existingJPGFiles, pdfOptions, progressBar, counters, verbose) {
  const { jpgDirectory, density, width, height } = pdfOptions;
  const pdfFilename = path.basename(pdfPath);
  const pdfReference = extractReference(pdfFilename);

  if (!pdfReference) {
    sendLog(`⚠️ No reference found for ${pdfFilename}`, verbose);
    counters.failure++;
    progressBar.increment();
    progressBar.update({ generated: counters.generated, skipped: counters.skipped, failure: counters.failure });
    return;
  }

  if (existingJPGFiles.has(pdfReference)) {
    counters.skipped++;
    progressBar.increment();
    progressBar.update({ generated: counters.generated, skipped: counters.skipped, failure: counters.failure });
    return;
  } else {
    sendLog(`⚡ Generating JPG for reference ${pdfReference}...`, verbose);

    const outputFilename = path.parse(pdfFilename).name;

    const convert = fromPath(pdfPath, {
      density: density || 72,
      saveFilename: outputFilename,
      savePath: jpgDirectory,
      format: 'jpg',
      height: height || 1920,
      preserveAspectRatio: true,
    });

    try {
      await convert(1);

      // Le fichier généré avec suffixe
      const generatedFile = path.join(jpgDirectory, `${outputFilename}.1.jpg`);
      const finalFile = path.join(jpgDirectory, `${outputFilename}.jpg`);

      // Renommer sans suffixe
      await fs.promises.rename(generatedFile, finalFile);

      sendLog(`🖼️ JPG created: ${outputFilename}.jpg`, verbose);
      counters.generated++;
    } catch (error) {
      sendLog(`❌ Error generating JPG for ${pdfReference}: ${error}`, verbose);
      counters.failure++;
    }
  }
  progressBar.increment();
  progressBar.update({ generated: counters.generated, skipped: counters.skipped, failure: counters.failure });
}

// 🔥 Main function with dynamic options
async function processAllPDFs({
  pdfDirectory,
  jpgDirectory,
  width,
  height,
  density,
  parallelLimit,
  verbose = true,
} = {}) {
  try {
    const pdfFiles = await findAllPDFs(pdfDirectory);
    const existingJPGFiles = await fs.promises.readdir(jpgDirectory);
    const existingReferences = new Set(existingJPGFiles.map(extractReference).filter((ref) => ref !== null));

    const counters = { generated: 0, skipped: 0, failure: 0 };
    const progressBar = createProgressBar(pdfFiles.length);

    sendLog(`🔍 Found ${pdfFiles.length} PDF files.`, verbose);

    const limit = pLimit(parallelLimit);

    const pdfOptions = { jpgDirectory, width, height, density };

    const limitedPromises = pdfFiles.map((pdfPath) =>
      limit(() => processSinglePDF(pdfPath, existingReferences, pdfOptions, progressBar, counters, verbose)),
    );

    await Promise.all(limitedPromises);

    // progressBar.update({
    //   generated: counters.generated,
    //   skipped: counters.skipped,
    //   failure: counters.failure,
    // });

    progressBar.stop();

    console.log('\n🎯 Processing complete:');
    console.log(
      `\n🖼️  ${counters.generated} generated | ✅ ${counters.skipped} skipped | ❌ ${counters.failure} failed.`,
    );
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

await processAllPDFs({
  pdfDirectory: path.join(__dirname, '../public/STANDARDS'),
  jpgDirectory: path.join(__dirname, '../public/PREVIEW'),
  height: 1920,
  density: 72,
  parallelLimit: 5,
  verbose: false,
});
