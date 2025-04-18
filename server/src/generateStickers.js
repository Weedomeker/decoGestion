/**
 * Génère des étiquettes PDF pour chaque commande
 * @param {Array<Object>} commande - Tableau d'objets contenant les numéros de commande et le nombre d'exemplaires
 * @param {string} outPath - Chemin du dossier où seront enregistrées les étiquettes
 */
const { degrees, PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const arr = [
  {
    cmd: 54540,
    ville: 'Lille',
    visuel: '5Galets 100x200_73800972_S_.pdf',
    format_visu: '1_100x200',
    ref: 73800972,
    ex: 1,
  },
  {
    cmd: 54540,
    ville: 'Lille',
    visuel: '5GaletsUnis 100x200_73800993_S_.pdf',
    format_visu: '1_100x200',
    ref: 73800993,
    ex: 2,
  },
  {
    cmd: 54541,
    ville: 'Tourcoing',
    visuel: 'Acier 100x200_73801511_S_.pdf',
    format_visu: '1_100x200',
    ref: 73801511,
    ex: 1,
  },
  {
    cmd: 54541,
    ville: 'Tourcoing',
    visuel: 'Bois 100x200_73801511_S_.pdf',
    format_visu: '1_100x200',
    ref: 738015116,
    ex: 1,
  },
  {
    cmd: 54542,
    ville: 'Perpignan',
    visuel: 'Marbre 100x200_73801511_S_.pdf',
    format_visu: '1_100x200',
    ref: 738015113,
    ex: 1,
  },
  {
    cmd: 54543,
    ville: 'Langueux',
    visuel: 'Caroline 100x200_73801511_S_.pdf',
    format_visu: '1_100x200',
    ref: 738015119,
    ex: 1,
  },
];

async function generateStickers(commande, outPath, showDataCmd = false) {
  if (!Array.isArray(commande) || commande.length === 0) {
    console.error('La commande est vide ou non valide.');
    return;
  }
  if (!fs.existsSync(outPath)) {
    fs.mkdirSync(outPath, { recursive: true });
  }

  // Grouper les commandes par `cmd` et accumuler les exemplaires
  const groupedCommands = commande.reduce((acc, curr) => {
    const { cmd, ex } = curr;
    if (!acc[cmd]) {
      acc[cmd] = { items: [], maxEx: 0 };
    }
    acc[cmd].items.push(curr);
    acc[cmd].maxEx += ex; // Ajouter les exemplaires à ce `cmd`
    return acc;
  }, {});

  // Générer les stickers pour chaque commande
  const promises = Object.values(groupedCommands).flatMap(({ items, maxEx }) => {
    // Créer un compteur pour chaque exemplaire dans la commande
    let currentEx = 0;

    return items.flatMap((cmdInfo) => {
      const { cmd, ex } = cmdInfo;

      // Générer un sticker pour chaque exemplaire
      return Array.from({ length: ex }, () => {
        currentEx++; // Incrémenter le numéro d'exemplaire
        return createStickers(
          cmd,
          `${currentEx.toString().padStart(2, '0')}/${maxEx.toString().padStart(2, '0')}`, // Ex : 01/03
          outPath,
          cmdInfo,
          showDataCmd,
          maxEx,
        );
      });
    });
  });

  await Promise.all(promises);
}

async function createStickers(numCmd, ex, outPath, cmd, showDataCmd) {
  const originalNotice = path.join(__dirname, '../public/images/notice_deco.pdf');

  let infoCommande = [];
  const match = cmd.visuel.match(/(gauche|droit)/i);

  if (showDataCmd) {
    if (cmd) {
      // Extraction des informations spécifiques pour chaque commande
      infoCommande = [
        cmd.ville || 'Ville inconnue',
        cmd.visuel
          ?.split(/\d{3}x\d{3}/i)
          .shift()
          .trim() || 'Visuel inconnu',
        match ? match[0] : '',
        cmd.ref?.toString() || 'Réf inconnue',
        cmd.format_visu?.split('_').pop().trim() || 'Format inconnu',
      ];
    }
  }

  try {
    // Lire le modèle de PDF
    const readPdf = await fs.promises.readFile(originalNotice);
    const pdfDoc = await PDFDocument.load(readPdf);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const font2 = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();

    // Afficher la numérotation des exemplaires (par ex. : 01/03)
    const text = `${numCmd} ${ex}`;
    const textWidth = font.widthOfTextAtSize(text, 20);
    const textHeight = font.heightAtSize(20);

    firstPage.drawText(text, {
      x: width / 2 - textWidth / 2,
      y: height - textHeight,
      size: 20,
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
      let fontSize = 10;
      const textData = 'LM_' + infoCommande.join(' - ').toLocaleUpperCase();
      let textDataWidth = font.widthOfTextAtSize(textData, fontSize);
      const textDataHeight = font.heightAtSize(fontSize);
      if (textDataWidth > width) {
        fontSize = 8;
        textDataWidth = font.widthOfTextAtSize(textData, fontSize);
      }

      firstPage.drawText(textData, {
        x: width / 2 - textDataWidth / 2,
        y: height - textDataHeight - textHeight * 1.5,
        size: fontSize,
        font: font2,
        color: rgb(0, 0, 0),
      });
    }

    // Enregistrer le PDF généré
    const pdfBytes = await pdfDoc.save();

    // Créer le dossier de sortie si nécessaire
    if (!fs.existsSync(outPath)) {
      fs.mkdirSync(outPath, { recursive: true });
    }

    // Nom du fichier basé sur le numéro de commande et l'exemplaire
    const fileName = `${numCmd}_${ex.split('/')[0]}.pdf`;
    await fs.promises.writeFile(`${outPath}/${fileName}`, pdfBytes);
  } catch (error) {
    console.error('La génération des étiquettes a échoué : ', error);
  }
}

// async function createStickersPage(directory, outputPath, pageSize = 'A5') {
//   const format =
//     pageSize === 'A5'
//       ? { width: 420, height: 595 } // Dimensions pour A5
//       : { width: 595, height: 842 }; // Dimensions pour A4

//   const margin = 0; // Marge entre les pages
//   const outputPdf = await PDFDocument.create();
//   const files = fs
//     .readdirSync(directory)
//     .filter((file) => file.endsWith('.pdf'))
//     .filter((file) => /^[\d]/.test(file));

//   if (files.length === 0) {
//     console.error('Aucun fichier PDF trouvé dans le répertoire.');
//     return;
//   }

//   let currentPage = null;
//   let itemCount = 0; // Compteur global pour savoir où placer chaque page A5

//   for (const file of files) {
//     try {
//       const filePath = path.join(directory, file);
//       const pdfBytes = fs.readFileSync(filePath);
//       const inputPdf = await PDFDocument.load(pdfBytes);

//       const inputPage = inputPdf.getPage(0); // Charger la première page
//       const { width, height } = inputPage.getSize();

//       let rotation = pageSize === 'A4' ? degrees(0) : degrees(90);

//       const embeddedPage = await outputPdf.embedPage(inputPage);

//       if (itemCount % (pageSize === 'A5' ? 2 : 4) === 0) {
//         currentPage = outputPdf.addPage([format.width, format.height]);
//       }

//       const positionIndex = itemCount % (pageSize === 'A5' ? 2 : 4);
//       let x = 0;
//       let y = 0;

//       if (pageSize === 'A4') {
//         // Haut Gauche
//         if (positionIndex === 0) {
//           x = format.width / 2 - width;
//           y = format.height / 2;

//           // Bas Gauche
//         } else if (positionIndex === 1) {
//           x = format.width / 2;
//           y = format.height / 2;
//           rotation = degrees(180);

//           // Haut Droite
//         } else if (positionIndex === 2) {
//           x = format.width / 2;
//           y = format.height / 2;

//           // Bas Droite
//         } else if (positionIndex === 3) {
//           x = format.width;
//           y = format.height / 2;
//           rotation = degrees(180);
//         }
//       } else {
//         if (positionIndex === 0) {
//           x = format.width;
//           y = format.height / 2;
//         } else if (positionIndex === 1) {
//           x = format.width;
//           y = 0;
//         }
//       }

//       currentPage.drawPage(embeddedPage, {
//         x,
//         y,
//         width: width,
//         height: height,
//         rotate: rotation,
//       });

//       itemCount++;
//     } catch (error) {
//       console.error(`Erreur lors du traitement du fichier ${file}:`, error.message);
//     }
//   }

//   try {
//     let finalPath = outputPath;
//     let suffix = 1;

//     while (fs.existsSync(finalPath)) {
//       const parsedPath = path.parse(outputPath);
//       finalPath = path.format({
//         dir: parsedPath.dir,
//         name: `${parsedPath.name}_${suffix}`,
//         ext: parsedPath.ext,
//       });
//       suffix++;
//     }
//     const pdfBytes = await outputPdf.save();
//     fs.writeFileSync(finalPath, pdfBytes);
//     console.log(`Stickers enregistrés sous : ${finalPath}`);
//   } catch (error) {
//     console.error('Erreur lors de la sauvegarde du fichier PDF :', error.message);
//   }
// }

async function createStickersPage(directory, outputPath, pageSize = 'A5') {
  const format =
    pageSize === 'A5'
      ? { width: 420, height: 595 } // Dimensions pour A5
      : { width: 595, height: 842 }; // Dimensions pour A4

  const margin = 0; // Marge entre les pages
  const outputPdf = await PDFDocument.create();
  const files = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith('.pdf'))
    .filter((file) => /^[\d]/.test(file));

  if (files.length === 0) {
    console.error('Aucun fichier PDF trouvé dans le répertoire.');
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
      let rotation = pageSize === 'A4' ? degrees(0) : degrees(90);

      // Extraire l'ID de la commande du nom du fichier (si nécessaire)
      const commandId = extractCommandId(file);

      // Si c'est une nouvelle commande, créer une nouvelle page
      if (commandId !== currentCommandId) {
        currentCommandId = commandId;
        currentPage = outputPdf.addPage([format.width, format.height]); // Créer une nouvelle page pour la commande
        itemCount = 0; // Réinitialiser le compteur d'éléments
      }

      if ((pageSize === 'A4' && itemCount >= 4) || (pageSize === 'A5' && itemCount >= 2)) {
        currentPage = outputPdf.addPage([format.width, format.height]);
        itemCount = 0;
      }

      positionIndex = itemCount;

      const embeddedPage = await outputPdf.embedPage(inputPage);

      let x = 0;
      let y = 0;

      // Logique de placement des stickers sur la page
      if (pageSize === 'A4') {
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
      console.error(`Erreur lors du traitement du fichier ${file}:`, error.message);
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
    fs.writeFileSync(finalPath, pdfBytes);
    console.log(`Stickers enregistrés sous : ${finalPath}`);
  } catch (error) {
    console.error('Erreur lors de la sauvegarde du fichier PDF :', error.message);
  }
}

// Fonction pour extraire l'ID de la commande à partir du nom du fichier
function extractCommandId(fileName) {
  // Suppose que l'ID de la commande est la première partie du nom du fichier, avant le premier underscore
  const match = fileName.match(/^(\d+)/);
  return match ? match[0] : null;
}

// const directoryPath = path.join(__dirname, '../public/TEST'); // Répertoire contenant les PDF A5
// const outputFilePath = directoryPath + '/Etiquettes' + '/Etiquettes.pdf'; // Nom du fichier PDF généré
// (async function () {
//   try {
//     await generateStickers(arr, directoryPath + '/' + 'Etiquettes', true);
//     await createStickersPage(directoryPath + '/Etiquettes', outputFilePath, 'A5').catch((error) => console.log(error));
//   } catch (error) {
//     console.log(error);
//   }
// })();

module.exports = { generateStickers, createStickersPage };
