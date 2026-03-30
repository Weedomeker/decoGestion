/**
 * Génère des étiquettes PDF pour chaque commande
 * @param {Array<Object>} commande - Tableau d'objets contenant les numéros de commande et le nombre d'exemplaires
 * @param {string} outPath - Chemin du dossier où seront enregistrées les étiquettes
 */
const { degrees, PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fs = require("fs");
const path = require("path");
const m = require("gm");
const logger = require("./logger/logger");

function getVisuelsForCmd(cmdInfo) {
  const visuels = [
    {
      commandId: cmdInfo.cmd,
      visuelIndex: 1,
    },
  ];

  // 👉 condition UNIQUE pour créer V2
  if (cmdInfo.visuPath2) {
    const commandId = cmdInfo.cmd2 && cmdInfo.cmd2 > 0 ? cmdInfo.cmd2 : cmdInfo.cmd; // fallback si cmd2 = 0

    visuels.push({
      commandId,
      visuelIndex: 2,
      isStock: !(cmdInfo.cmd2 && cmdInfo.cmd2 > 0), // Si cmd2 est absent ou égal à 0, c'est du stock
    });
  }

  return visuels;
}
async function generateStickers(commande, outPath, showDataCmd = false) {
  if (!Array.isArray(commande) || commande.length === 0) {
    logger.error("La commande est vide ou non valide.");
    return;
  }

  if (!fs.existsSync(outPath)) {
    fs.mkdirSync(outPath, { recursive: true });
  }

  // Grouper les commandes par `cmd` et accumuler les exemplaires
  const groupedCommands = commande.reduce((acc, curr) => {
    const key = curr.cmd;

    if (!acc[key]) {
      acc[key] = {
        items: [],
        maxEx: 0,
        cmd: curr.cmd,
        cmd2: curr.cmd2,
      };
    }

    acc[key].items.push(curr);
    acc[key].maxEx += curr.ex;

    return acc;
  }, {});

  // Générer les stickers pour chaque commande
  const promises = [];

  Object.values(groupedCommands).forEach(({ items, maxEx, cmd, cmd2 }) => {
    let currentEx = 0;

    items.forEach((cmdInfo) => {
      for (let i = 0; i < cmdInfo.ex; i++) {
        currentEx++;
        const exStr = `${currentEx.toString().padStart(2, "0")}/${maxEx.toString().padStart(2, "0")}`;

        const visuels = getVisuelsForCmd(cmdInfo);

        visuels.forEach(({ commandId, visuelIndex, isStock }) => {
          promises.push(
            createStickers(
              commandId,
              exStr,
              outPath,
              {
                ...cmdInfo,
                commandId,
                visuelIndex,
                isStock,
              },
              showDataCmd,
            ),
          );
        });
      }
    });
  });

  await Promise.all(promises);
}

async function createStickers(numCmd, ex, outPath, cmd, showDataCmd) {
  const notice_deco = path.join(__dirname, "../public/images/notice_deco.pdf");
  const notice_casto = path.join(__dirname, "../public/images/notice_casto.pdf");
  const notice_brico = path.join(__dirname, "../public/images/notice_brico.pdf");
  const pathPreview = path.join(__dirname, "../public/PREVIEW");

  // Nouveau : support deux visuels CASTO
  const useSecond = cmd.visuelIndex === 2;

  const ref = useSecond ? cmd.ref2 : cmd.ref;
  const visuel = useSecond ? cmd.visuel2 : cmd.visuel;
  const format = useSecond ? cmd.format2_visu : cmd.format_visu;

  // if (!ref || !visuel) {
  //   logger.error("❌ Données manquantes sur la commande " + numCmd);
  // }

  let files;
  const isCasto = cmd.client === "CASTO";
  const isBrico = cmd.client === "BRICO";

  try {
    files = fs.readdirSync(pathPreview);
  } catch (err) {
    logger.error("Erreur dossier PREVIEW:", err);
    files = [];
  }

  // Récupération de la référence ou nom
  //const teinteMasse = ['blanc zero', 'noir zero', 'alu brosse', 'granit 3'];

  const ref2 = null;
  const name2 = null;

  // Filtrage des fichiers image qui contiennent la référence
  const images = files.filter(
    (file) =>
      file.toLowerCase().endsWith(".jpg") && (file.includes(ref) || file.toLowerCase().includes(visuel.toLowerCase())),
  );

  const imagesTeinteMasse = files.filter(
    (file) => file.toLowerCase().endsWith(".jpg") && file.toLowerCase().includes(visuel.toLowerCase()),
  );

  let infoCommande = [];
  const match = (useSecond ? cmd.visuel2 : cmd.visuel)?.match(/(gauche|droit|centre)/i);

  if (showDataCmd) {
    if (cmd) {
      const castoNameVisuel = [];
      if (isCasto) {
        //CRED 255x60cm BETON CLAIR 3664711962643 MAT.pdf

        const origineCastoName = [cmd.visuel, cmd.visuel2];
        //extraction nom visuel
        const nameCasto = origineCastoName.map((name) =>
          name
            ?.replace(/\d{2,}x\d{2,}/i, "")
            ?.replace("cm", "")
            ?.replace("CRED", "")
            ?.replace(/\d{13}/, "")
            ?.replace("MAT.pdf", "")
            ?.replace("BRILLANT.pdf", "")
            .trim(),
        );
        castoNameVisuel.push(nameCasto[0], nameCasto[1]);
      }
      // Extraction des informations spécifiques pour chaque commande
      infoCommande.push(
        cmd.ville || "Ville inconnue",
        isCasto || isBrico
          ? castoNameVisuel[0]
          : cmd.visuel
              ?.split(/\d{2,}x\d{2,}/i)
              .shift()
              .trim() || "Visuel inconnu",
        match ? match[0] : null,
        cmd.ref?.toString() || "Réf inconnue",
        cmd.format_visu?.split("_").pop().trim() || "Format inconnu",
      );
      isCasto || isBrico
        ? infoCommande.push(
            castoNameVisuel[1] || "Visuel inconnu",
            cmd.ref2?.toString() || "Réf inconnue",
            cmd.format2_visu?.split("_").pop().trim() || "Format inconnu",
          )
        : null;
    }
  }

  try {
    // Lire le modèle de PDF
    let readPdf;
    if (isCasto) {
      readPdf = await fs.promises.readFile(notice_casto);
    } else if (isBrico) {
      readPdf = await fs.promises.readFile(notice_brico);
    } else {
      readPdf = await fs.promises.readFile(notice_deco);
    }
    const pdfDoc = await PDFDocument.load(readPdf);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const font2 = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();

    // Afficher la numérotation des exemplaires (par ex. : 01/03)
    let text = "";
    if (cmd.visuelIndex === 2 && cmd.isStock) {
      text = "STOCK";
    } else {
      text = numCmd > 0 ? `${numCmd} ${ex}` : "";
    }
    const textWidth = font.widthOfTextAtSize(text, 16);
    const textHeight = font.heightAtSize(16);

    firstPage.drawText(text, {
      x: width / 2 - textWidth / 2,
      y: height - textHeight * 7.7,
      size: 16,
      font: font,
      color: rgb(0, 0, 0),
    });

    // Afficher Gauche Droite
    if (!showDataCmd) {
      if (match) {
        firstPage.drawText(match[0], {
          x: width / 2 - font.widthOfTextAtSize(match[0], 16) / 2,
          y: height - textHeight - textHeight * 1.2,
          size: 16,
          font: font,
          color: rgb(0, 0, 0),
        });
      }
    }

    // Ajouter les informations de la commande (si demandé)
    if (showDataCmd) {
      const usedFont = font2; // police fine pour l’affichage

      // Extraction du nom propre CASTO
      function cleanCastoName(str) {
        return str
          ?.replace(/\d{2,}x\d{2,}/i, "")
          ?.replace("cm", "")
          ?.replace("CRED", "")
          ?.replace(/\d{13}/, "")
          ?.replace("MAT.pdf", "")
          ?.replace("BRILLANT.pdf", "")
          .trim();
      }

      // Sélection cohérente selon le sticker
      const currentVisuelRAW = useSecond ? cmd.visuel2 : cmd.visuel;
      const currentRef = useSecond ? cmd.ref2 : cmd.ref;
      const currentFormat = useSecond ? cmd.format2_visu : cmd.format_visu;

      let currentVisuelName;
      if (isCasto) {
        currentVisuelName = cleanCastoName(currentVisuelRAW);
      } else if (isBrico) {
        currentVisuelName = currentVisuelRAW?.split(/\d{2,}x\d{2,}/i)[0]?.trim();
      } else {
        currentVisuelName = currentVisuelRAW?.split(/\d{2,}x\d{2,}/i)[0]?.trim();
      }

      const matchGD = currentVisuelRAW?.match(/(gauche|droit|centre)/i);

      const infoCommande = [
        cmd.ville || "",
        currentVisuelName || "",
        matchGD ? matchGD[0] : "",
        currentRef?.toString() || "",
        currentFormat?.split("_").pop().replace("/", "").trim() || "Format inconnu",
      ];

      // Construction de la ligne affichée
      const textData = infoCommande.join(" ").toUpperCase();

      // Sélection correcte de l'image preview
      const miniaturePreview = images[0] || "";

      // Ajustement de la taille du texte
      let fontSize = 10;
      let textDataWidth = usedFont.widthOfTextAtSize(textData, fontSize);

      const textDataHeight = usedFont.heightAtSize(fontSize);

      if (textDataWidth > width) {
        fontSize = 6;
        textDataWidth = usedFont.widthOfTextAtSize(textData, fontSize);
      }

      // Dessin du texte
      firstPage.drawText(textData, {
        x: width / 2 - textDataWidth / 2,
        y: height - textDataHeight - textHeight * 8.4,
        size: fontSize,
        font: usedFont,
        color: rgb(0, 0, 0),
      });

      // Preview image
      const jpgPath = path.join(pathPreview, miniaturePreview);

      if (fs.existsSync(jpgPath)) {
        const imageBuffer = fs.readFileSync(jpgPath);
        const img = await pdfDoc.embedJpg(imageBuffer);

        const origWidth = img.width;
        const maxRenderedHeight = 90;
        const scaleFactor = maxRenderedHeight / origWidth;

        const scaledDims = img.scale(scaleFactor);

        firstPage.drawImage(img, {
          x: width / 2 - scaledDims.height / 2,
          y: height - scaledDims.width - textHeight * 3.5,
          width: scaledDims.width,
          height: scaledDims.height,
          rotate: degrees(-90),
        });
      }
    }

    // Enregistrer le PDF généré
    const pdfBytes = await pdfDoc.save();

    // Créer le dossier de sortie si nécessaire
    if (!fs.existsSync(outPath)) {
      fs.mkdirSync(outPath, { recursive: true });
    }

    // Nom du fichier basé sur le numéro de commande et l'exemplaire
    const vernis = extractVernis(cmd);
    const vernisTag = vernis === true ? "_B" : vernis === false ? "_M" : "";
    const commandId = cmd.commandId || numCmd;
    let visuelTag;
    if (cmd.client === "CASTO" || cmd.client === "BRICO") {
      visuelTag = `_V${cmd.visuelIndex}`;
    } else {
      visuelTag = "";
    }
    const fileName = `${commandId}${visuelTag}${vernisTag}_${ex.split("/")[0]}.pdf`;
    await fs.promises.writeFile(`${outPath}/${fileName}`, pdfBytes);
  } catch (error) {
    logger.error("La génération des étiquettes a échoué : ", error);
  }
}

async function createStickersPage(directory, outputPath, pageSize = "A4") {
  const format =
    pageSize === "A5"
      ? { width: 420, height: 595 } // Dimensions pour A5
      : { width: 595, height: 842 }; // Dimensions pour A4

  const margin = 0; // Marge entre les pages
  const outputPdf = await PDFDocument.create();
  const files = fs.readdirSync(directory).filter((file) => file.endsWith(".pdf"));
  //.filter((file) => /^[\d]/.test(file));

  if (files.length === 0) {
    logger.error("Aucun fichier PDF trouvé dans le répertoire.");
    return;
  }

  let currentPage = null;
  let itemCount = 0; // Compteur global pour savoir où placer chaque sticker
  let positionIndex = 0;

  let currentCommandId = null; // ID de la commande actuelle pour éviter de mélanger

  for (const file of files) {
    try {
      const filePath = path.join(directory, file);
      const pdfBytes = fs.readFileSync(filePath);
      const inputPdf = await PDFDocument.load(pdfBytes);

      const inputPage = inputPdf.getPage(0); // Charger la première page
      const { width, height } = inputPage.getSize();
      let rotation = pageSize === "A4" ? degrees(0) : degrees(90);

      // Extraire l'ID de la commande du nom du fichier (si nécessaire)
      const commandId = extractCommandId(file);

      // Si c'est une nouvelle commande, créer une nouvelle page
      if (commandId !== currentCommandId) {
        currentCommandId = commandId;
        currentPage = outputPdf.addPage([format.width, format.height]); // Créer une nouvelle page pour la commande
        itemCount = 0; // Réinitialiser le compteur d'éléments
      }

      if ((pageSize === "A4" && itemCount >= 4) || (pageSize === "A5" && itemCount >= 2)) {
        currentPage = outputPdf.addPage([format.width, format.height]);
        itemCount = 0;
      }

      positionIndex = itemCount;

      const embeddedPage = await outputPdf.embedPage(inputPage);

      let x = 0;
      let y = 0;

      // Logique de placement des stickers sur la page
      if (pageSize === "A4") {
        // Haut Gauche
        if (positionIndex === 0) {
          x = format.width / 2 - width;
          y = format.height / 2;

          // Haut Droite
        } else if (positionIndex === 2) {
          x = format.width / 2 - width;
          y = format.height / 2 - height;
          //rotation = degrees(180);

          // Bas Gauche
        } else if (positionIndex === 1) {
          x = format.width / 2;
          y = format.height / 2;

          // Bas Droite
        } else if (positionIndex === 3) {
          x = format.width / 2;
          y = format.height / 2 - height;
          // rotation = degrees(180);
        }
      } else {
        if (positionIndex === 0) {
          x = format.width;
          y = format.height / 2;
        } else if (positionIndex === 1) {
          x = format.width;
          y = 0;
        }
      }

      // Dessiner le sticker sur la page
      currentPage.drawPage(embeddedPage, {
        x,
        y,
        width: width,
        height: height,
        rotate: rotation,
      });

      itemCount++; // Incrémenter le compteur pour le placement suivant
    } catch (error) {
      logger.error(`Erreur lors du traitement du fichier ${file}:`, error.message);
    }
  }

  try {
    let finalPath = outputPath;
    let suffix = 1;

    while (fs.existsSync(finalPath)) {
      const parsedPath = path.parse(outputPath);
      finalPath = path.format({
        dir: parsedPath.dir,
        name: `${parsedPath.name}_${suffix}`,
        ext: parsedPath.ext,
      });
      suffix++;
    }
    const pdfBytes = await outputPdf.save();
    await fs.promises.writeFile(finalPath, pdfBytes);
    logger.info(`Stickers enregistrés sous : ${finalPath}`);
  } catch (error) {
    logger.error("Erreur lors de la sauvegarde du fichier PDF :", error.message);
  }
}

// Fonction pour extraire l'ID de la commande à partir du nom du fichier
function extractCommandId(fileName) {
  // Exemple : 54542_2_M_01.pdf ou 54542_M_01.pdf
  const commandMatch = fileName.match(/^(\d+)/); // capture le 54542 et le _2 si présent
  const vernisMatch = fileName.match(/_(B|M)_/i); // capture _B_ ou _M_

  const id = commandMatch ? commandMatch[1] : null;
  const vernis = vernisMatch ? vernisMatch[1].toUpperCase() : "";

  return `${id}_${vernis}`;
}

function extractVernis(cmd) {
  //regex pour match Brillant ou Mat
  const regexBrillant = /brillant/i;
  const regexMat = /mat/i;
  const matchBrillant = regexBrillant.test(cmd.visuel);
  const matchMat = regexMat.test(cmd.visuel);
  if (matchBrillant) return true;
  if (matchMat) return false;
}

module.exports = { generateStickers, createStickersPage };
