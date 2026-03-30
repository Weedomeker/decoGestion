const fs = require("fs");
const path = require("path");

const SOURCE_DIR = path.join(`\\\\NASSYNORS1221\\agence\\1-décokin\\ DECO-K-IN\\05 PHOTOS\\05 Photo BricoMarché`);
const DEST_DIR = "./output";

// Création dossier output
if (!fs.existsSync(DEST_DIR)) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
}

// 🔁 Parcours récursif
function walk(dir) {
  let results = [];

  if (!fs.existsSync(dir)) {
    console.error("❌ Dossier introuvable :", dir);
    return results;
  }

  const list = fs.readdirSync(dir);

  list.forEach((file) => {
    const fullPath = path.join(dir, file);

    try {
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        results = results.concat(walk(fullPath));
      } else {
        results.push(fullPath);
      }
    } catch (err) {
      console.warn("⚠️ Erreur accès :", fullPath);
    }
  });

  return results;
}

// 🔤 Normalisation globale
function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "") // nettoie caractères chelous
    .trim();
}

// 🔑 Extraction
function extractKey(name) {
  const normalized = normalize(name);

  const dimMatch = normalized.match(/(\d{2,4})\s*x\s*(\d{2,4})/);
  const dimension = dimMatch ? `${dimMatch[1]}x${dimMatch[2]}` : "";

  const words = normalized.match(/[a-z]+/g) || [];

  return { dimension, words, normalized };
}

// 🚀 MAIN
const files = walk(SOURCE_DIR);

const pdfs = [];
const jpgs = [];

// 📂 Séparation
files.forEach((file) => {
  const ext = path.extname(file).toLowerCase();
  const baseName = path.basename(file);
  const relativePath = path.relative(SOURCE_DIR, file);
  const rootFolder = relativePath.split(path.sep)[0];
  const folderName = normalize(rootFolder);
  if (ext === ".pdf") {
    pdfs.push({
      path: file,
      name: baseName,
      folder: folderName,
      key: extractKey(baseName),
    });
  }

  if (ext === ".jpg" || ext === ".jpeg") {
    const key = extractKey(baseName);

    // 🎯 uniquement les "10ème"
    if (key.normalized.includes("10eme")) {
      jpgs.push({
        path: file,
        name: baseName,
        folder: folderName,
        key,
      });
    }
  }
});

console.log(`📄 PDFs trouvés: ${pdfs.length}`);
console.log(`🖼️ JPGs (10ème): ${jpgs.length}`);

let success = 0;
let fallbackUsed = 0;
let failed = 0;

// 🔗 Matching
jpgs.forEach((jpg) => {
  // ✅ MATCH PRINCIPAL (DOSSIER + DIMENSION)
  let match = pdfs.find((pdf) => pdf.folder === jpg.folder && pdf.key.dimension === jpg.key.dimension);

  // 🔁 FALLBACK (si pas trouvé)
  if (!match) {
    const candidates = pdfs.filter((pdf) => pdf.key.dimension === jpg.key.dimension);

    const scored = candidates.map((pdf) => {
      const common = jpg.key.words.filter((w) => pdf.key.words.includes(w));
      return { pdf, score: common.length };
    });

    scored.sort((a, b) => b.score - a.score);

    if (scored[0] && scored[0].score >= 2) {
      match = scored[0].pdf;
      fallbackUsed++;
      console.log(`⚠️ Fallback utilisé pour: ${jpg.name}`);
    }
  }

  // 📁 Copie
  if (match) {
    const pdfName = path.basename(match.path, ".pdf");
    const newPath = path.join(DEST_DIR, pdfName + ".jpg");

    try {
      fs.copyFileSync(jpg.path, newPath);
      console.log(`✅ ${jpg.name} → ${pdfName}.jpg`);
      success++;
    } catch (err) {
      console.error(`❌ Erreur copie: ${jpg.name}`);
    }
  } else {
    console.log(`❌ Pas de PDF pour: ${jpg.name}`);
    console.log("   dossier:", jpg.folder);
    console.log("   dimension:", jpg.key.dimension);
    failed++;
  }
});

// 📊 Résumé
console.log("\n--- RÉSULTAT ---");
console.log(`✅ Succès: ${success}`);
console.log(`⚠️ Fallback utilisés: ${fallbackUsed}`);
console.log(`❌ Échecs: ${failed}`);
