const { PDFDocument, degrees, StandardFonts, rgb } = require("pdf-lib");
const fs = require("fs");
const { cmToPoints, pointsToCm } = require("./server/src/convertUnits");

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
  if (sizes.length === 1) return placeOne(plateW, plateH, sizes[0].w, sizes[0].h);
  if (sizes.length === 2) return placeTwo(plateW, plateH, sizes[0].w, sizes[0].h, sizes[1].w, sizes[1].h, spacing);
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

    for (let v of visuals) {
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
      let pos = { ...positions[i] };
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
    let xPosition = cmToPoints(2);
    let textSize = 65;
    const textFichiers = text.join(" + ");
    const textWidth = helveticaFont.widthOfTextAtSize(textFichiers, textSize);

    page.drawText(textFichiers, {
      x: -xPosition + plateW,
      y: xPosition,
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
    // (Optionnel) conversion en cm pour debug
    console.log("MinY global (cm):", pointsToCm(globalMinY));
    console.log("MaxY global (cm):", pointsToCm(globalMaxY));
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
      let regSize = cmToPoints(0.3);
      let regPosition = regSize + cmToPoints(1);

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
    await fs.promises.writeFile(`${writePath}/test.pdf`, pdfBytes);
    console.log("PDF généré avec succès !");
  } catch (e) {
    console.error("Erreur modifyPdf:", e);
  }
}

// --- Exemple d’utilisation ---
//54542 - LM LILLE - 101x215 - 5Galets_73800965_100x200_S_  1_EX
modifyPdf(
  {
    visuals: [
      {
        file: "./visu_casto/visuA.pdf",
        name: "54542 - CASTO LILLE - 101x215 - 5Galets_73800965_100x200_S_  1_EX",
      },
      {
        file: "./visu_casto/visuB.pdf",
        name: "58584 - CASTO MARSEILLE - 101x215 - 5Galets_73800965_100x200_S_  1_EX",
      },
    ],
    plaque: "150x305",
    spacing: null,
  },

  "./",
);
