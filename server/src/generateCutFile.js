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
const { placePanels } = require("./amalgameCredences.js");

function generateCutFile(dibondWidth, dibondHeight, cutWidth, cutHeight, millingMargin, outPath) {
  if (millingMargin === undefined || millingMargin === null || isNaN(millingMargin)) {
    millingMargin = 6;
  }
  let content = `MGE i-cut script\n// Produced by Esko i-cut Layout 20.0.0 NT\nClear\nSystemUnits mm Local\nOpenCuttingKeyFor Dibond 3mm\n`;

  // Calcul de la position centrée de la découpe
  const cutX = (dibondWidth - cutWidth) / 2;
  const cutY = (dibondHeight - cutHeight) / 2;

  // Ajouter les marques de repérage (4 coins + 2 en bas à droite)
  const regSize = 3;
  const fondPerdu = 5;
  const regMarksMarginX = 10 + fondPerdu + regSize;
  const regMarksMarginY = 10 - fondPerdu + regSize;
  const regMarks = [
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

  const wasteSpacing = 800; // Espacement max entre WasteCuts

  // Définition des zones protégées autour de la découpe
  const safeXStart = cutX - millingMargin;
  const safeXEnd = cutX + cutWidth + millingMargin;
  const safeYStart = cutY - millingMargin;
  const safeYEnd = cutY + cutHeight + millingMargin;

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
    const numWasteCuts = Math.max(2, Math.floor(dibondWidth / wasteSpacing)); // Minimum 2 wastecuts
    const adjustedSpacing = dibondWidth / numWasteCuts; // Espacement équivalent entre les découpes

    // Boucle pour générer les découpes
    for (let i = 1; i < numWasteCuts; i++) {
      // Calculer la position de chaque découpe
      const x = i * adjustedSpacing;

      // GAUCHE
      content += `MoveTo ${x}, ${safeYStart}, Open, WasteCutting\n`;
      content += `LineTo ${x}, ${0}, Corner\n`;

      // DROITE
      content += `MoveTo ${x}, ${dibondHeight}, Open, WasteCutting\n`;
      content += `LineTo ${x}, ${safeYEnd}, Corner\n`;
    }
  }

  // Écrire dans un fichier
  const fileName = `${cutHeight / 10}x${cutWidth / 10}`;
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
  cutSizes, // [{cutWidth, cutHeight}, ...]
  millingMargin,
  outPath,
  spacing = null, // en mm
) {
  if (!millingMargin || isNaN(millingMargin)) millingMargin = 6;

  //
  // --- 1) Conversion du format pour placePanels (exact modifyPdf)
  //
  const DEBORD = 0;
  const sizes = cutSizes.map((s) => ({ w: s.cutWidth + DEBORD, h: s.cutHeight + DEBORD }));

  // ✨ IMPORTANT : placePanels fait la logique EXACTE de modifyPdf
  let positions = placePanels({
    plateW: dibondWidth,
    plateH: dibondHeight,
    sizes,
    spacing, // spacing mm brut, même logique que modifyPdf
  });

  //
  // --- 2) Fallback vertical IDENTIQUE à placeTwo (si horizontal impossible)
  //
  if (!positions) {
    const p1 = cutSizes[0];
    const p2 = cutSizes[1];

    const finalSpacing = spacing ?? (dibondHeight - (p1.cutHeight + p2.cutHeight)) / 3;
    const totalHeight = p1.cutHeight + p2.cutHeight + finalSpacing;

    if (totalHeight <= dibondHeight) {
      const startY = (dibondHeight - totalHeight) / 2;

      positions = [
        { x: (dibondWidth - p1.cutWidth) / 2, y: startY },
        {
          x: (dibondWidth - p2.cutWidth) / 2,
          y: startY + p1.cutHeight + finalSpacing,
        },
      ];
    }
  }

  if (!positions) {
    throw new Error("Impossible de placer les panneaux sur le Dibond.");
  }

  //
  // --- 3) Construction du CUT identique à ton système
  //
  let content = `MGE i-cut script
Clear
SystemUnits mm Local
OpenCuttingKeyFor Dibond 3mm
`;

  // --- Découpes ---
  content += `SelectLayer Cut\n`;

  for (let i = 0; i < cutSizes.length; i++) {
    const { cutWidth: w, cutHeight: h } = cutSizes[i];
    const { x, y } = positions[i];
    const cutX = x - DEBORD / 2;
    const cutY = y - DEBORD / 2;

    content += `MoveTo ${cutX},${cutY},Closed,Cut\n`;
    content += `LineTo ${cutX + w},${cutY},Corner\n`;
    content += `LineTo ${cutX + w},${cutY + h},Corner\n`;
    content += `LineTo ${cutX},${cutY + h},Corner\n`;
    content += `LineTo ${cutX},${cutY},Corner\n`;
  }

  //
  // --- Regmarks globaux (inchangé)
  //
  // content += `SelectLayer RegMark\n`;

  // const regSize = 3;
  // const margin = 10 + regSize + 5;

  // [
  //   { x: margin, y: margin },
  //   { x: dibondWidth - margin, y: margin },
  //   { x: margin, y: dibondHeight - margin },
  //   { x: dibondWidth - margin, y: dibondHeight - margin },
  // ].forEach((m) => {
  //   content += `RegMark ${m.x},${m.y},Regmark\n`;
  // });

  // --- WasteCutting (inchangé)

  // content += `SelectLayer WasteCutting\n`;
  // const wasteSpacing = 800;

  // for (let x = wasteSpacing; x < dibondWidth; x += wasteSpacing) {
  //   content += `MoveTo ${x},0,Open,WasteCutting\n`;
  //   content += `LineTo ${x},${dibondHeight},Corner\n`;
  // }

  // for (let y = wasteSpacing; y < dibondHeight; y += wasteSpacing) {
  //   content += `MoveTo 0,${y},Open,WasteCutting\n`;
  //   content += `LineTo ${dibondWidth},${y},Corner\n`;
  // }

  //
  // --- Sauvegarde
  //
  try {
    const fileName = `cut_${cutSizes.length}panels.cut`;
    if (!fs.existsSync(outPath)) fs.mkdirSync(outPath, { recursive: true });
    fs.writeFileSync(path.join(outPath, fileName), content);
  } catch (err) {
    logger.error(err);
  }
}

// Exemple d'utilisation dynamique
//generateCutFile(2600, 1250, 2550, 1000, 6, path.join('./'));

module.exports = { generateCutFile, generateCutFileTwoCuts };
