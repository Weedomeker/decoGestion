/**
 * Génère des étiquettes PDF pour chaque commande
 * @param {Array<Object>} commande - Tableau d'objets contenant les numéros de commande et le nombre d'exemplaires
 * @param {string} outPath - Chemin du dossier où seront enregistrées les étiquettes
 */
const { degrees, PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fs = require("fs");
const path = require("path");
const logger = require("./logger/logger");
const { state } = require("./services/appState");
const { donneesEtiquette, PREVIEW_DIR } = require("./stickers/donneesEtiquette");
const { renderSticker } = require("./stickers/renderSticker");
const { modeleParDefaut, chargerImage } = require("./stickers/modeles");

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

  await Promise.all(
    planEtiquettes(commande).map(({ cmdInfo, commandId, visuelIndex, isStock, ex }) =>
      createStickers(commandId, ex, outPath, { ...cmdInfo, commandId, visuelIndex, isStock }, showDataCmd),
    ),
  );
}

// Les jobs finissent dans n'importe quel ordre : un sur-mesure reprend son rang dans le PDF, pour que
// l'étiquette 02 soit bien le panneau 2 du PDF et du .cut. Les autres jobs gardent leur place.
// Panneaux de plusieurs PDF (tous en page 0) : le rang vient du nom numéroté dans la commande.
const rangPanneau = (cmdInfo) => Number(String(cmdInfo.smNom || "").match(/^\d+-(\d+)\s/)?.[1]) || cmdInfo.smPage + 1;

function ordonnerPanneaux(commande) {
  const estPanneau = (cmdInfo) => Number.isInteger(cmdInfo.smPage);
  const panneaux = commande.filter(estPanneau).sort((a, b) => a.cmd - b.cmd || rangPanneau(a) - rangPanneau(b));
  return commande.map((cmdInfo) => (estPanneau(cmdInfo) ? panneaux.shift() : cmdInfo));
}

// Une étiquette par panneau, numérotée par commande (NN/TT). Un amalgame de 2 panneaux de la même
// commande donne 01/02 et 02/02 : numérotées par plaque, les 2 étiquettes sortaient en 01/01.
// Les panneaux stock ne sont pas comptés ; leur numéro ne sert qu'au nom de fichier (après TT, unique).
function planEtiquettes(commande) {
  const panneaux = [];
  ordonnerPanneaux(commande).forEach((cmdInfo) => {
    let panneauxRestants = cmdInfo.panneaux;
    for (let i = 0; i < cmdInfo.ex; i++) {
      getVisuelsForCmd(cmdInfo).forEach(({ commandId, visuelIndex, isStock }) => {
        // Crédence dupliquée : ex = plaques de 2 panneaux, seuls les panneaux commandés sont numérotés.
        if (cmdInfo.panneaux) {
          if (panneauxRestants > 0) {
            panneauxRestants--;
          } else if (cmdInfo.useStock) {
            return; // panneau en trop jamais imprimé : rien n'est pris en stock pour lui
          } else {
            isStock = true; // panneau en trop d'un nombre impair : part en stock
          }
        }
        panneaux.push({ cmdInfo, commandId, visuelIndex, isStock });
      });
    }
  });

  const totals = {};
  panneaux.forEach((p) => {
    if (!p.isStock) totals[p.commandId] = (totals[p.commandId] || 0) + 1;
  });
  const counters = {};
  const pad = (n) => n.toString().padStart(2, "0");
  return panneaux.map((p) => {
    const total = totals[p.commandId] || 0;
    // Le stock est compté à part, après le total : numéro de fichier unique, jamais imprimé
    const key = p.isStock ? `${p.commandId}/stock` : p.commandId;
    counters[key] = (counters[key] || 0) + 1;
    return { ...p, ex: `${pad(counters[key] + (p.isStock ? total : 0))}/${pad(total)}` };
  });
}

async function createStickers(numCmd, ex, outPath, cmd, showDataCmd) {
  const useSecond = cmd.visuelIndex === 2;
  const visuel = useSecond ? cmd.visuel2 : cmd.visuel;

  let files;
  try {
    files = fs.readdirSync(PREVIEW_DIR);
  } catch (err) {
    logger.error("Erreur dossier PREVIEW:", err);
    files = [];
  }

  // Miniature recherchée par ref uniquement (case-insensitive) : le repli par nom de visuel a été
  // retiré (a26cfc0) car un même décor existe en plusieurs formats. Sans ref (étiquette saisie à la
  // main), l'absence de miniature est donc normale — seule une ref sans aperçu mérite un warn.
  // Sur-mesure : sa propre miniature. Le catalogue montrerait le même décor sur tous les panneaux.
  const donnees = donneesEtiquette(cmd, numCmd, ex, {
    files,
    jpgSurMesureDir: `${state.paths.jpgPath}/${state.paths.sessionPRINTSA}`,
  });
  if (cmd.miniatureForcee) {
    // Onglet Sticker : aperçu choisi à la main ou fichier importé, pour cette étiquette seulement.
    donnees.miniaturePath = cmd.miniatureForcee.chemin || null;
    donnees.miniatureData = cmd.miniatureForcee.data || null;
    logger.debug(`generateStickers: miniature imposée (${cmd.miniatureForcee.nom})`);
  } else if (cmd.smBase) {
    logger.debug(`generateStickers: miniature sur-mesure pour "${cmd.smBase}"`);
  } else if (!donnees.ref) {
    logger.info(`generateStickers: pas de référence pour "${visuel}", étiquette sans miniature`);
  } else if (!donnees.miniatureFichier) {
    logger.warn(`generateStickers: aucun JPG trouvé par référence "${donnees.ref}" pour "${visuel}"`);
  }

  try {
    // Modèle éditable : celui transmis (onglet Sticker), sinon le modèle par défaut de l'enseigne.
    // Sans modèle ou si le rendu échoue, l'étiquette sort sur l'ancien PDF notice.
    let pdfBytes = null;
    let elements = cmd.etiquetteElements;
    if (!elements) {
      try {
        elements = (await modeleParDefaut(cmd.client))?.elements;
      } catch (err) {
        logger.warn(`generateStickers: modèle d'étiquette illisible pour ${cmd.client} (${err.message}), PDF notice utilisé`);
      }
    }
    if (elements?.length) {
      try {
        pdfBytes = await renderSticker(elements, donnees, { chargerImage });
      } catch (err) {
        logger.warn(`generateStickers: rendu du modèle échoué (${err.message}), PDF notice utilisé`);
      }
    } else {
      logger.warn(`generateStickers: aucun modèle d'étiquette pour ${cmd.client || "?"}, PDF notice utilisé`);
    }
    if (!pdfBytes) pdfBytes = await etiquetteNotice(cmd, donnees, showDataCmd);

    if (!fs.existsSync(outPath)) {
      fs.mkdirSync(outPath, { recursive: true });
    }

    // Nom du fichier basé sur le numéro de commande et l'exemplaire
    const vernis = extractVernis(cmd);
    const vernisTag = vernis === true ? "_B" : vernis === false ? "_M" : "";
    const commandId = cmd.commandId || numCmd;
    const visuelTag = cmd.client === "CASTO" || cmd.client === "BRICO" ? `_V${cmd.visuelIndex}` : "";
    const formatTag =
      cmd.smFormat ||
      (useSecond ? cmd.format2_visu : cmd.format_visu)
        ?.split("_").pop()?.trim() || "unknown";
    const smTag = cmd.smBase ? "_SM" : "";
    const fileName = `${commandId}${smTag}${visuelTag}${vernisTag}_${formatTag}_${ex.split("/")[0]}.pdf`;
    await fs.promises.writeFile(`${outPath}/${fileName}`, pdfBytes);
  } catch (error) {
    logger.error("La génération des étiquettes a échoué : ", error);
  }
}

// Ancienne étiquette : PDF notice de l'enseigne + textes posés à coordonnées fixes. Repli seulement.
async function etiquetteNotice(cmd, donnees, showDataCmd) {
  const notices = { CASTO: "notice_casto.pdf", BRICO: "notice_brico.pdf" };
  const readPdf = await fs.promises.readFile(
    path.join(__dirname, "../public/images", notices[cmd.client] || "notice_deco.pdf"),
  );
  const pdfDoc = await PDFDocument.load(readPdf);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const font2 = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const firstPage = pdfDoc.getPages()[0];
  const { width, height } = firstPage.getSize();

  // Numérotation des exemplaires (par ex. : 169580 01/03) ou STOCK
  const text = donnees.numEx;
  const textWidth = font.widthOfTextAtSize(text, 16);
  const textHeight = font.heightAtSize(16);
  firstPage.drawText(text, {
    x: width / 2 - textWidth / 2,
    y: height - textHeight * 7.7,
    size: 16,
    font,
    color: rgb(0, 0, 0),
  });

  if (!showDataCmd) {
    if (donnees.orientation) {
      firstPage.drawText(donnees.orientation, {
        x: width / 2 - font.widthOfTextAtSize(donnees.orientation, 16) / 2,
        y: height - textHeight - textHeight * 1.2,
        size: 16,
        font,
        color: rgb(0, 0, 0),
      });
    }
    return pdfDoc.save();
  }

  const textData = donnees.infos;
  let fontSize = 10;
  let textDataWidth = font2.widthOfTextAtSize(textData, fontSize);
  const textDataHeight = font2.heightAtSize(fontSize);
  if (textDataWidth > width) {
    fontSize = 6;
    textDataWidth = font2.widthOfTextAtSize(textData, fontSize);
  }
  firstPage.drawText(textData, {
    x: width / 2 - textDataWidth / 2,
    y: height - textDataHeight - textHeight * 8.4,
    size: fontSize,
    font: font2,
    color: rgb(0, 0, 0),
  });

  const miniature =
    donnees.miniatureData ||
    (donnees.miniaturePath && fs.existsSync(donnees.miniaturePath) ? fs.readFileSync(donnees.miniaturePath) : null);
  if (miniature) {
    const img = miniature[0] === 0x89 ? await pdfDoc.embedPng(miniature) : await pdfDoc.embedJpg(miniature);
    const scaledDims = img.scale(90 / img.width);
    firstPage.drawImage(img, {
      x: width / 2 - scaledDims.height / 2,
      y: height - scaledDims.width - textHeight * 3.5,
      width: scaledDims.width,
      height: scaledDims.height,
      rotate: degrees(-90),
    });
  }
  return pdfDoc.save();
}

async function createStickersPage(directory, outputPath, pageSize = "A4", ordreCommandes = []) {
  const format =
    pageSize === "A5"
      ? { width: 420, height: 595 } // Dimensions pour A5
      : { width: 595, height: 842 }; // Dimensions pour A4

  const outputPdf = await PDFDocument.create();
  const files = trierFichiersEtiquettes(
    fs.readdirSync(directory).filter((file) => file.endsWith(".pdf")),
    ordreCommandes,
  );

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
      const rotation = pageSize === "A4" ? degrees(0) : degrees(90);

      // Extraire l'ID de la commande du nom du fichier (si nécessaire)
      const commandId = extractCommandId(file);

      // Si c'est une nouvelle commande, créer une nouvelle page
      if (commandId !== currentCommandId) {
        currentCommandId = commandId;
        currentPage = outputPdf.addPage([format.width, format.height]); // Créer une nouvelle page pour la commande
        itemCount = 0; // Réinitialiser le compteur d'éléments
      }

      if (pageSize === "A4" && itemCount >= 4 || pageSize === "A5" && itemCount >= 2) {
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
        }
 else if (positionIndex === 2) {
          x = format.width / 2 - width;
          y = format.height / 2 - height;
          //rotation = degrees(180);

          // Bas Gauche
        }
 else if (positionIndex === 1) {
          x = format.width / 2;
          y = format.height / 2;

          // Bas Droite
        }
 else if (positionIndex === 3) {
          x = format.width / 2;
          y = format.height / 2 - height;
          // rotation = degrees(180);
        }
      }
 else {
        if (positionIndex === 0) {
          x = format.width;
          y = format.height / 2;
        }
 else if (positionIndex === 1) {
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
    }
 catch (error) {
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
  }
 catch (error) {
    logger.error("Erreur lors de la sauvegarde du fichier PDF :", error.message);
  }
}

function extractFormat(fileName) {
  const match = fileName.match(/_([^_]+)_\d{2}\.pdf$/);
  return match ? match[1] : "unknown";
}

function formatArea(fmtStr) {
  const match = fmtStr.replace(/,/g, ".").match(/(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/i);
  return match ? parseFloat(match[1]) * parseFloat(match[2]) : 0;
}

const numeroEtiquette = (fileName) => parseInt(fileName.match(/_(\d{2})\.pdf$/)?.[1] || "0", 10);

// Planche : par commande, puis du plus grand format au plus petit. Un sur-mesure suit ses numéros.
// Sessions Tauro : les pages (une par commande) suivent l'ordre d'impression donné par ordreCommandes ;
// une commande se place à sa première plaque imprimée, une commande absente de la liste passe à la fin.
// Sans ordre, tri habituel (comparerEtiquettes).
function trierFichiersEtiquettes(files, ordreCommandes = []) {
  const rang = new Map();
  ordreCommandes.forEach((cmd, i) => {
    if (!rang.has(String(cmd))) rang.set(String(cmd), i);
  });
  const rangDe = (f) => rang.get((f.match(/^(\d+)/) || [])[1]) ?? Number.MAX_SAFE_INTEGER;
  return [...files].sort((a, b) => rangDe(a) - rangDe(b) || comparerEtiquettes(a, b));
}

function comparerEtiquettes(a, b) {
  const idA = extractCommandId(a);
  const idB = extractCommandId(b);
  if (idA !== idB) return idA.localeCompare(idB);
  if (a.includes("_SM_") && b.includes("_SM_")) return numeroEtiquette(a) - numeroEtiquette(b);
  return formatArea(extractFormat(b)) - formatArea(extractFormat(a));
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
  const visuelToCheck = cmd.visuelIndex === 2 ? cmd.visuel2 : cmd.visuel;
  if (/brillant/i.test(visuelToCheck)) return true;
  if (/mat/i.test(visuelToCheck)) return false;
}

module.exports = { generateStickers, createStickersPage, planEtiquettes, comparerEtiquettes, trierFichiersEtiquettes };
