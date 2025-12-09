/**
 * La fonction `generateCutFile` crée un fichier de découpe pour un matériau Dibond avec des
 * dimensions spécifiées, y compris la découpe principale, les repères de registration, les déchets de
 * découpe et un calcul d'offset global automatique.
 * @param dibondWidth - Le paramètre `dibondWidth` représente la largeur du matériau Dibond en
 * millimètres. C'est la largeur du matériau sur lequel les coupes et les déchets de découpe seront
 * effectués.
 * @param dibondHeight - Le paramètre `dibondHeight` représente la hauteur du matériau Dibond, qui est
 * un type de substrat rigide couramment utilisé dans l'impression et la signalisation. Elle est
 * généralement mesurée en millimètres et est la dimension verticale de la feuille de Dibond que vous
 * utilisez.
 * @param cutWidth - Le paramètre `cutWidth` représente la largeur de la découpe que vous souhaitez
 * générer sur le matériau Dibond. Cette valeur détermine la taille horizontale de la forme de
 * découpe sur le matériau.
 * @param cutHeight - Le paramètre `cutHeight` représente la hauteur de la zone de découpe sur le
 * matériau Dibond. Elle est utilisée dans la fonction `generateCutFile` pour calculer la position et
 * les dimensions de la découpe, ainsi que pour générer des déchets de découpe autour de la zone de
 * découpe principale. La fonction crée ensuite un fichier de découpe
 **/

const fs = require("fs");
const path = require("path");
const logger = require("./logger/logger.js");
const placePanels = require("./appCasto.js");

//cacluler metre lineaire
function linearCutFile(dibondWidth, dibondHeight, cutWidth, cutHeight) {
  const timeCut = 10;
  const fraise = 3;
  const dec = (cutWidth + cutHeight) * 2;
  let VerticalWastes = dibondWidth - cutWidth - fraise;
  let HorizontalWastes = dibondHeight - cutHeight - fraise < 10 ? 0 : (dibondHeight - cutHeight - fraise) * 2;
  let wastes = VerticalWastes + HorizontalWastes;
  const total = (dec + wastes) / 1000; // en mètres
  let cutTime = parseFloat((timeCut * total).toFixed(2));
  let minutes = Math.floor(cutTime / 60);
  let seconds = (cutTime % 60).toFixed(2);

  logger.info(VerticalWastes, HorizontalWastes);
  logger.info(total, "mètres");
  logger.info(minutes + " min(s) " + seconds + " secs");
}

function mmToPt(mm) {
  return mm * 2.834645669;
}

function generateCutFile(dibondWidth, dibondHeight, cutWidth, cutHeight, millingMargin, outPath) {
  if (millingMargin === undefined || millingMargin === null || isNaN(millingMargin)) {
    millingMargin = 6;
  }
  let content = `MGE i-cut script\n// Produced by Esko i-cut Layout 20.0.0 NT\nClear\nSystemUnits mm Local\nOpenCuttingKeyFor Dibond 3mm\n`;

  // Calcul de la position centrée de la découpe
  let cutX = (dibondWidth - cutWidth) / 2;
  let cutY = (dibondHeight - cutHeight) / 2;

  // Ajouter les marques de repérage (4 coins + 2 en bas à droite)
  let regSize = 3;
  let fondPerdu = 5;
  let regMarksMarginX = 10 + fondPerdu + regSize;
  let regMarksMarginY = 10 - fondPerdu + regSize;
  let regMarks = [
    { x: cutX - regMarksMarginX, y: cutY + regMarksMarginY },
    { x: cutX + cutWidth + regMarksMarginX, y: cutY + regMarksMarginY },
    { x: cutX - regMarksMarginX, y: cutY + cutHeight - regMarksMarginY },
    { x: cutX + cutWidth + regMarksMarginX, y: cutY + cutHeight - regMarksMarginY },
    { x: cutX - regMarksMarginX, y: cutY + cutHeight - 100 - regMarksMarginY },
  ];
  regMarks.forEach((mark) => {
    content += `RegMark ${mark.x},${mark.y},Regmark\n`;
  });

  // Définir la découpe principale
  content += `SelectLayer Cut\nMoveTo ${cutX},${cutY},Closed,Cut\n`;
  content += `LineTo ${cutX + cutWidth},${cutY},Corner\n`;
  content += `LineTo ${cutX + cutWidth},${cutY + cutHeight},Corner\n`;
  content += `LineTo ${cutX},${cutY + cutHeight},Corner\n`;
  content += `LineTo ${cutX},${cutY},Corner\n`;

  // Sélectionner la couche WasteCutting
  // Sélectionner la couche WasteCutting
  content += `SelectLayer WasteCutting\n`;

  let wasteSpacing = 800; // Espacement max entre WasteCuts

  // Définition des zones protégées autour de la découpe
  let safeXStart = cutX - millingMargin;
  let safeXEnd = cutX + cutWidth + millingMargin;
  let safeYStart = cutY - millingMargin;
  let safeYEnd = cutY + cutHeight + millingMargin;

  // 🟢 Générer les wastecuts VERTICAUX (coupent de haut en bas)
  for (let y = 0; y <= dibondHeight; y += wasteSpacing) {
    // BAS
    content += `MoveTo ${safeXStart}, ${dibondHeight / 2}, Open, WasteCutting\n`;
    content += `LineTo ${0}, ${dibondHeight / 2}, Corner\n`;
    // HAUT
    content += `MoveTo ${dibondWidth}, ${dibondHeight / 2}, Open, WasteCutting\n`;
    content += `LineTo ${safeXEnd}, ${dibondHeight / 2}, Corner\n`;
  }

  // 🟢 Générer les wastecuts HORIZONTAUX (de gauche à droite)
  if ((dibondHeight - cutHeight) / 2 > 10) {
    let numWasteCuts = Math.max(2, Math.floor(dibondWidth / wasteSpacing)); // Minimum 2 wastecuts
    let adjustedSpacing = dibondWidth / numWasteCuts; // Espacement équivalent entre les découpes

    // Boucle pour générer les découpes
    for (let i = 1; i < numWasteCuts; i++) {
      // Calculer la position de chaque découpe
      let x = i * adjustedSpacing;

      // GAUCHE
      content += `MoveTo ${x}, ${safeYStart}, Open, WasteCutting\n`;
      content += `LineTo ${x}, ${0}, Corner\n`;

      // DROITE
      content += `MoveTo ${x}, ${dibondHeight}, Open, WasteCutting\n`;
      content += `LineTo ${x}, ${safeYEnd}, Corner\n`;
    }
  }

  // Écrire dans un fichier
  let fileName = `${cutHeight / 10}x${cutWidth / 10}`;
  try {
    if (!fs.existsSync(outPath)) {
      fs.mkdirSync(outPath, { recursive: true });
    }
    fs.writeFileSync(`${outPath}/${fileName}.cut`, content);
    logger.info("Fichier cut ✅");
  } catch (error) {
    logger.error(error);
  }
}

function generateCutFileTwoCuts(
  dibondWidth,
  dibondHeight,
  cutSizes, // [{w,h},{w,h}]
  millingMargin,
  outPath,
) {
  if (!millingMargin || isNaN(millingMargin)) millingMargin = 6;

  logger.warn("⚠️ Génération de deux découpes");

  // ↗️ LÀ : tu utilises ta fonction existante
  const positions = placePanels({
    plateW: dibondWidth,
    plateH: dibondHeight,
    sizes: cutSizes.map((s) => ({ w: s.cutWidth, h: s.cutHeight })),
    spacing: null,
  });

  logger.info(positions);

  if (!positions) {
    throw new Error("Impossible de placer les panneaux sur le Dibond.");
  }

  let content = `MGE i-cut script
Clear
SystemUnits mm Local
OpenCuttingKeyFor Dibond 3mm
`;

  // ----------------------------------------------------
  // 1) Ajouter les 2 découpes
  // ----------------------------------------------------
  content += `SelectLayer Cut\n`;

  cutSizes.forEach((panel, index) => {
    const { cutWidth: w, cutHeight: h } = panel;
    const { x, y } = positions[index];

    content += `MoveTo ${x},${y},Closed,Cut\n`;
    content += `LineTo ${x + w},${y},Corner\n`;
    content += `LineTo ${x + w},${y + h},Corner\n`;
    content += `LineTo ${x},${y + h},Corner\n`;
    content += `LineTo ${x},${y},Corner\n`;
  });

  // ----------------------------------------------------
  // 2) Repères globaux (à 4 coins du Dibond)
  // ----------------------------------------------------
  const regSize = 3;
  const margin = 10 + regSize + 5;

  const regMarks = [
    { x: margin, y: margin },
    { x: dibondWidth - margin, y: margin },
    { x: margin, y: dibondHeight - margin },
    { x: dibondWidth - margin, y: dibondHeight - margin },
  ];

  regMarks.forEach((mark) => {
    content += `RegMark ${mark.x},${mark.y},Regmark\n`;
  });

  // ----------------------------------------------------
  // 3) WasteCutting global (comme ton fichier actuel)
  // ----------------------------------------------------
  content += `SelectLayer WasteCutting\n`;

  const wasteSpacing = 800;

  // Waste verticaux
  for (let x = wasteSpacing; x < dibondWidth; x += wasteSpacing) {
    content += `MoveTo ${x},0,Open,WasteCutting\n`;
    content += `LineTo ${x},${dibondHeight},Corner\n`;
  }

  // Waste horizontaux
  for (let y = wasteSpacing; y < dibondHeight; y += wasteSpacing) {
    content += `MoveTo 0,${y},Open,WasteCutting\n`;
    content += `LineTo ${dibondWidth},${y},Corner\n`;
  }

  // ----------------------------------------------------
  // 4) Écrire 1 seul fichier .cut
  // ----------------------------------------------------
  try {
    const fileName = `cut_${cutSizes.length}panels.cut`;
    if (!fs.existsSync(outPath)) {
      fs.mkdirSync(outPath, { recursive: true });
    }
    fs.writeFileSync(path.join(outPath, fileName), content);
    logger.info(`✂️ Fichier cut ${fileName} ✅`, fileName);
  } catch (error) {
    logger.error(error);
  }
}

// Exemple d'utilisation dynamique
//generateCutFile(2600, 1250, 2550, 1000, 6, path.join('./'));
// linearCutFile(2150, 1010, 2000, 1000);

module.exports = { generateCutFile, generateCutFileTwoCuts };
