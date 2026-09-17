const { PDFDocument, degrees, StandardFonts, rgb } = require("pdf-lib");
const fs = require("fs");
const { cmToPoints } = require("./convertUnits");
const logger = require("./logger/logger");

// --- Placement des panneaux ---
function placeOne(plateW, plateH, w, h) {
  return [{ x: (plateW - w) / 2, y: (plateH - h) / 2 }];
}

function placeTwo(plateW, plateH, w1, h1, w2, h2, spacing = null) {
  let finalSpacing = spacing != null ? spacing : (plateW - (w1 + w2)) / 3;
  if (w1 + w2 + finalSpacing > plateW) {
    finalSpacing = (plateW - (w1 + w2)) / 3;
    if (finalSpacing < 0) return null;
  }
  const totalWidth = w1 + w2 + finalSpacing;
  const startX = (plateW - totalWidth) / 2;
  const y1 = (plateH - h1) / 2;
  const y2 = (plateH - h2) / 2;
  return [
    { x: startX, y: y1 },
    { x: startX + w1 + finalSpacing, y: y2 },
  ];
}

function placePanels({ plateW, plateH, sizes, spacing }) {
  if (sizes.length === 1) {
    return placeOne(plateW, plateH, sizes[0].w, sizes[0].h);
  }
  if (sizes.length === 2) {
    return placeTwo(plateW, plateH, sizes[0].w, sizes[0].h, sizes[1].w, sizes[1].h, spacing);
  }
  return null;
}

// --- Fonction principale ---

async function modifyPdf({ visuals, plaque, spacing = null }, writePath, reg = true) {
  try {
    const pdfDoc = await PDFDocument.create();
    const [plaqueWcm, plaqueHcm] = plaque.split("x").map(Number);
    const plateW = cmToPoints(plaqueWcm);
    const plateH = cmToPoints(plaqueHcm);
    const page = pdfDoc.addPage([plateW, plateH]);
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const embeddedPanels = [];

    for (const v of visuals) {
      // --- Lire le PDF source ---
      const vBytes = await fs.promises.readFile(v.file);
      const vPdf = await PDFDocument.load(vBytes);

      const vPage = vPdf.getPages()[0];
      const realW = vPage.getWidth();
      const realH = vPage.getHeight();

      // --- Déterminer rotation si nécessaire ---
      const rotate = realW > plateW || realH > plateH;
      const renderW = rotate ? realH : realW;
      const renderH = rotate ? realW : realH;

      // --- Normaliser la page (flatten pour que x,y fonctionnent) ---
      const tmpPdf = await PDFDocument.create();
      const tmpPage = tmpPdf.addPage([realW, realH]);
      const tmpEmbedded = await tmpPdf.embedPage(vPage);
      tmpPage.drawPage(tmpEmbedded, { x: 0, y: 0 });
      const cleanBytes = await tmpPdf.save();
      const cleanPdf = await PDFDocument.load(cleanBytes);
      const cleanPage = cleanPdf.getPages()[0];

      // --- Embed la page nettoyée dans le PDF final ---
      const embedded = await pdfDoc.embedPage(cleanPage);

      embeddedPanels.push({ embedded, realW, realH, renderW, renderH, rotate, fileName: v.name });
    }

    // --- Positionner plus grand tjs à gauche ---
    embeddedPanels.sort((a, b) => b.renderW * b.renderH - a.renderW * a.renderH);

    // --- Calcul des positions ---
    const sizes = embeddedPanels.map((p) => ({ w: p.renderW, h: p.renderH }));
    const positions = placePanels({
      plateW,
      plateH,
      sizes,
      spacing: spacing ? cmToPoints(spacing) : null,
    });

    if (!positions) throw new Error("Impossible de placer les panneaux");

    // --- Dessin final ---
    // Pour stocker les textes fichiers
    const text = [];
    // Pour stocker les positions maximales
    const positionMin = [];
    const positionMax = [];

    for (let i = 0; i < embeddedPanels.length; i++) {
      const p = embeddedPanels[i];
      const pos = { ...positions[i] };
      const cx = pos.x + p.renderW / 2;
      const cy = pos.y + p.renderH / 2;

      text.push(p.fileName);

      if (p.rotate) {
        pos.x = cx + p.realH / 2;
        pos.y = cy - p.realW / 2;
      }

      // Calcul des positions minimales et maximales pour vérification
      positionMin.push({ x: pos.x - p.renderW, y: pos.y });
      positionMax.push({ x: pos.x, y: pos.y + p.renderH });

      page.drawPage(p.embedded, {
        x: pos.x,
        y: pos.y,
        rotate: p.rotate ? degrees(90) : undefined,
      });
    }

    // ---Insertion des noms des fichiers---
    const checkPlateSize = plateW < 4000;
    const xPosition = checkPlateSize ? cmToPoints(0.1) : cmToPoints(2);
    const textSize = checkPlateSize ? 35 : 65;
    const textFichiers = text.join(" + ");

    page.drawText(textFichiers, {
      x: -xPosition + plateW,
      y: xPosition + cmToPoints(4),
      size: textSize,
      font: helveticaFont,
      color: rgb(0, 0, 0),
      rotate: degrees(90),
    });
    // Récupère tous les Y minimaux et maximaux dans un seul tableau
    const allY = [...positionMin.map((p) => p.y), ...positionMax.map((p) => p.y)];
    const allX = [...positionMin.map((p) => p.x), ...positionMax.map((p) => p.x)];

    // Hauteur minimale globale
    const globalMinY = Math.min(...allY);
    const globalMaxY = Math.max(...allY);

    const globalMinX = Math.min(...allX);
    const globalMaxX = Math.max(...allX);

    // ---Insertion Regmarks ---
    if (reg) {
      const drawRegmarks = (xReg, yReg, sizeReg = 0.6) => {
        page.drawCircle({
          x: xReg, // haut - bas
          y: yReg, // gauche - droite
          size: cmToPoints(sizeReg / 2), // Conversion de cm à points pour la taille du cercle
          color: rgb(0, 0, 0),
        });
      };
      // Calcul de la position des repères en points (en utilisant cmToPoints)
      const regSize = cmToPoints(0.3);
      const regPosition = regSize + cmToPoints(1);

      // 1 --------------------- 4
      // 2                       |
      //                         |
      //                         |
      // 3 --------------------- 5
      drawRegmarks(globalMinX, globalMinY - regPosition); //1
      drawRegmarks(globalMinX + cmToPoints(10), globalMinY - regPosition); //2
      drawRegmarks(globalMaxX, globalMinY - regPosition); // 3

      drawRegmarks(globalMinX, globalMaxY + regPosition); // 4
      drawRegmarks(globalMaxX, globalMaxY + regPosition); // 5
    }

    // --- Sauvegarde ---
    const pdfBytes = await pdfDoc.save();
    await fs.promises.writeFile(writePath, pdfBytes);
    logger.info("PDF généré avec succès !");
  } catch (e) {
    logger.error("Erreur modifyPdf:", e);
  }
}

module.exports = { modifyPdf, placePanels };
