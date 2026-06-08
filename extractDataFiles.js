const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");

const directoryPath = path.join(__dirname, "./server/public/ECOM/");
const outputFilePath = path.join(__dirname, "output.csv");

const walkDirectory = (dir) => {
  const files = fs.readdirSync(dir, { withFileTypes: true });

  files.forEach((file) => {
    if (file.isDirectory()) {
      walkDirectory(path.join(dir, file.name));
    } else if (path.extname(file.name).toLowerCase() === ".pdf") {
      const fileName = path.parse(file.name).name;
      // Regex flexible :
      // 1. Visuel (tout début jusqu'au format)
      // 2. Format (NxN suivi éventuellement de texte comme +BLANC)
      // 3. Le reste (contient la finition et la référence)
      const regex = /^(.*?)\s+(\d+x\d+.*?)(\s+.*)$/i;
      const match = fileName.match(regex);
      if (match) {
        const visuel = match[1];
        const format = match[2];
        const remainder = match[3].trim();

        // On sépare la référence (celle avec le tiret) du reste (la finition)
        const refMatch = remainder.match(/([\w-]+-\w+)/);
        let reference = "";
        let finition = "";

        if (refMatch) {
          reference = refMatch[1];
          finition = remainder.replace(reference, "").trim();
        } else {
          finition = remainder;
        }

        // Déplacer DROIT ou GAUCHE du champ finition vers le visuel
        const sideMatch = finition.match(/\b(DROIT|GAUCHE)\b/i);
        let finalVisuel = visuel;
        let finalFinition = finition;

        if (sideMatch) {
          const side = sideMatch[1].toUpperCase();
          finalVisuel = `${visuel || ""} ${side}`.toUpperCase().trim();
          finalFinition = (finition || "").replace(new RegExp(`\\b${side}\\b`, "i"), "").trim();
        }

        // Gestion du +BLANC
        const blancRegex = /\+BLANC/i;
        const hasBlanc = format.toUpperCase().includes("+BLANC") || finalFinition.toUpperCase().includes("+BLANC");

        if (hasBlanc) {
          // On ne l'ajoute plus au visuel comme demandé
          const cleanFormat = format.replace(blancRegex, "").trim();
          var finalFormat = cleanFormat;
          finalFinition = finalFinition.replace(blancRegex, "").trim();
        } else {
          var finalFormat = format;
        }

        if (reference === "00000000" || !reference) return;
        data.push({ visuel: finalVisuel, format: finalFormat, finition: finalFinition, reference, blanc: hasBlanc });
      } else {
        console.warn(`Le nom de fichier "${file.name}" ne correspond pas au format attendu.`);
      }
    }
  });
};

const data = [];
walkDirectory(directoryPath);
const header = "model;format;finition;ref;blanc\n";
const csvData =
  header +
  data.map((item) => `${item.visuel};${item.format};${item.finition};${item.reference};${item.blanc}`).join("\n");
fs.writeFileSync(outputFilePath, csvData);
console.log(`Les données ont été extraites et enregistrées dans ${outputFilePath}`);
