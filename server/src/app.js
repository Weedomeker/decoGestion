const { degrees, PDFDocument, StandardFonts } = require("pdf-lib");
require("dotenv").config();
const fs = require("fs");
const { cmToPoints } = require("./convertUnits");
const logger = require("./logger/logger");
const { repairPageContentStreams } = require("./utils/repairPdfContent");
const { dessinerBandes, NOIR } = require("./utils/bandesEncrage");

// Les erreurs remontent à l'appelant (processJob) : avalées ici, elles ne laissaient qu'un
// « PDF de sortie manquant » sans la cause réelle.
async function modifyPdf(filePath, writePath, fileName, formatTauro, reg, bandes = false) {
  const readPdf = await fs.promises.readFile(filePath);
  const pdfDoc = await PDFDocument.load(readPdf);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // const [wSize, hSize] = format.split('x').map(Number);
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const { width, height } = firstPage.getSize();

  // Un flux source abîmé fait abandonner la page au RIP avant les repères/texte
  if (repairPageContentStreams(pdfDoc, firstPage) > 0) {
    logger.warn(`Flux de contenu PDF réparé (source abîmé) : ${filePath}`);
  }

  const fTauro = formatTauro.split("_").pop();
  const [largeurPlaqueCm, longueurPlaqueCm] = fTauro.split("x").map(Number);

  // Utiliser cmToPoints pour avoir des coordonnées cohérentesö
  const largeurPlaque = cmToPoints(largeurPlaqueCm);
  const longueurPlaque = cmToPoints(longueurPlaqueCm);

  // Plus petit et plus loin du visuel avec les bandes : le bas des lettres toucherait la bande.
  const xPosition = cmToPoints(bandes ? 0.75 : 0.5);
  const textSize = bandes ? 30 : 35;
  const text = fileName;
  const textWidth = helveticaFont.widthOfTextAtSize(text, textSize);

  const regPosition = cmToPoints(1.3);

  // Ajout de repères
  if (reg) {
    const drawRegmarks = (xReg, yReg, sizeReg = 0.6) => {
      firstPage.drawCircle({
        x: xReg, // haut - bas
        y: yReg, // gauche - droite
        size: cmToPoints(sizeReg / 2), // Conversion de cm à points pour la taille du cercle
        color: NOIR,
      });
    };
    // drawRegmarks(-regPosition, height - regPosition);
    // drawRegmarks(-regPosition, height - regPosition - cmToPoints(10));
    // drawRegmarks(-regPosition, regPosition);
    // drawRegmarks(width + regPosition, regPosition);
    // drawRegmarks(width + regPosition, height - regPosition);
    // 1 --------------------- 4
    // 2                       |
    //                         |
    //                         |
    // 3 --------------------- 5
    drawRegmarks(width - regPosition, height + regPosition); //1
    drawRegmarks(width - regPosition - cmToPoints(10), height + regPosition); //2
    drawRegmarks(regPosition, height + regPosition); // 3

    drawRegmarks(width - regPosition, -regPosition); // 4
    drawRegmarks(regPosition, -regPosition); // 5
  }

  firstPage.drawText(text, {
    x: width / 2 - textWidth / 2,
    y: height + xPosition,
    size: textSize,
    font: helveticaFont,
    color: NOIR,
    rotate: degrees(0),
  });

  if (bandes) {
    const dx = (largeurPlaque - width) / 2;
    const dy = (longueurPlaque - height) / 2;
    const ignores = dessinerBandes(firstPage, {
      plaque: { x0: -dx, y0: -dy, x1: width + dx, y1: height + dy },
      panneau: { x0: 0, y0: 0, x1: width, y1: height },
      reperes: {
        haut: [regPosition, width - regPosition - cmToPoints(10), width - regPosition],
        bas: [regPosition, width - regPosition],
      },
      nomHaut: [width / 2 - textWidth / 2, width / 2 + textWidth / 2],
    });
    if (ignores.length) logger.warn(`Bandes d'encrage : pas la place (${ignores.join(", ")}) · ${fileName}`);
  }

  firstPage.setRotation(degrees(-90)); // Appliquer une rotation de 90°
  firstPage.setSize(largeurPlaque, longueurPlaque);
  firstPage.translateContent((largeurPlaque - width) / 2, (longueurPlaque - height) / 2);
  firstPage.setTrimBox(0, 0, largeurPlaque, longueurPlaque);

  const pdfBytes = await pdfDoc.save();
  await fs.promises.writeFile(`${writePath}/${text}.pdf`, pdfBytes);
}

module.exports = modifyPdf;
