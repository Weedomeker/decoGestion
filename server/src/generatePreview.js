const fs = require('fs');
const path = require('path');
const { fromPath } = require('pdf2pic');
const pLimit = require('p-limit');
const cliProgress = require('cli-progress');

// Function to send logs to the terminal
function sendLog(message, verbose = true) {
  if (verbose) {
    console.log(message);
  }
}

// Function to create and start the progress bar
function createProgressBar(totalFiles) {
  const progressBar = new cliProgress.SingleBar(
    {
      format: '📄 {bar} {percentage}% | {value}/{total} PDFs | 🖼️  {generated} | ✅ {skipped} | ❌ {failure}\n',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      clearOnComplete: true,
      autopadding: true,
    },
    cliProgress.Presets.shades_classic,
  );

  //log verification jpg
  console.log('Check JPG files...');
  progressBar.start(totalFiles, 0, { generated: 0, skipped: 0, failure: 0 });
  return progressBar;
}

// Extract the reference number from the filename
function extractReference(filename) {
  const regex = /\b\d{7,}\b/;
  const match = filename.match(regex);
  return match ? match[0] : null;
}

// Recursively find all PDFs
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

// Process a single PDF
async function processSinglePDF(pdfPath, existingJPGFiles, pdfOptions, progressBar, counters, verbose) {
  const { jpgDirectory, density, width, height } = pdfOptions;
  const pdfFilename = path.basename(pdfPath);
  const pdfReference = extractReference(pdfFilename);

  if (!pdfReference) {
    sendLog(`⚠️ No reference found for ${pdfFilename}`, verbose);
    counters.failure++;
    progressBar.increment(1, { generated: counters.generated, skipped: counters.skipped, failure: counters.failure });
    return;
  }

  if (existingJPGFiles.has(pdfReference)) {
    counters.skipped++;
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

      const generatedFile = path.join(jpgDirectory, `${outputFilename}.1.jpg`);
      const finalFile = path.join(jpgDirectory, `${outputFilename}.jpg`);

      if (await fs.promises.stat(generatedFile).catch(() => null)) {
        await fs.promises.rename(generatedFile, finalFile);
        sendLog(`🖼️ JPG created: ${outputFilename}.jpg`, verbose);
        counters.generated++;
      } else {
        throw new Error(`Generated file not found: ${generatedFile}`);
      }
    } catch (error) {
      sendLog(`❌ Error generating JPG for ${pdfReference}: ${error}`, verbose);
      counters.failure++;
    }
  }

  progressBar.increment(1, { generated: counters.generated, skipped: counters.skipped, failure: counters.failure });
}

// Main function with dynamic options
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
    // 1. Récupérer tous les PDFs
    const pdfFiles = await findAllPDFs(pdfDirectory);

    // 2. Lister les JPGs déjà existants
    const existingJPGFiles = await fs.promises.readdir(jpgDirectory);
    const existingReferences = new Set(existingJPGFiles.map(extractReference).filter((ref) => ref !== null));

    // 3. Filtrer uniquement les PDFs dont le JPG n'existe PAS encore
    const pdfsToGenerate = pdfFiles.filter((pdfPath) => {
      const ref = extractReference(path.basename(pdfPath));
      return ref && !existingReferences.has(ref);
    });

    const counters = { generated: 0, skipped: pdfFiles.length - pdfsToGenerate.length, failure: 0 };

    // 4. Progress bar basée uniquement sur les PDFs à générer
    const progressBar = createProgressBar(pdfsToGenerate.length);

    sendLog(`🔍 Total PDFs: ${pdfFiles.length}`, verbose);
    sendLog(`🖼️  Previews to generate: ${pdfsToGenerate.length}`, verbose);
    sendLog(`✅ Already existing previews (skipped): ${counters.skipped}`, verbose);

    const limit = pLimit(parallelLimit);
    const pdfOptions = { jpgDirectory, width, height, density };

    // 5. Lancer la génération seulement pour ceux à générer
    const limitedPromises = pdfsToGenerate.map((pdfPath) =>
      limit(() => processSinglePDF(pdfPath, existingReferences, pdfOptions, progressBar, counters, verbose)),
    );

    await Promise.all(limitedPromises);

    progressBar.stop();

    console.log(
      `🎯 Processing complete: 🖼️  ${counters.generated} generated | ✅ ${counters.skipped} skipped | ❌ ${counters.failure} failed.`,
    );
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

module.exports = {
  processAllPDFs,
};
