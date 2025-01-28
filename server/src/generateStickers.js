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
  if (showDataCmd) {
    if (cmd) {
      // Extraction des informations spécifiques pour chaque commande
      infoCommande = [
        cmd.ville || 'Ville inconnue',
        cmd.visuel
          ?.split(/\d{3}x\d{3}/i)
          .shift()
          .trim() || 'Visuel inconnu',
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
    const textWidth = font.widthOfTextAtSize(text, 30);
    const textHeight = font.heightAtSize(30);

    firstPage.drawText(text, {
      x: width / 2 - textWidth / 2,
      y: height - textHeight,
      size: 30,
      font: font,
      color: rgb(0, 0, 0),
    });

    // Ajouter les informations de la commande (si demandé)
    if (showDataCmd) {
      let interLine = textHeight * 3.5; // Position initiale des lignes de texte
      infoCommande.forEach((text) => {
        const textWidth = font2.widthOfTextAtSize(text, 14);
        const textHeight = font2.heightAtSize(14);
        interLine += textHeight * 1.5; // Ajouter un interligne
        firstPage.drawText(text, {
          x: width / 2 - textWidth / 2,
          y: height - interLine,
          size: 14,
          font: font2,
          color: rgb(0, 0, 0),
        });
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
    .filter((file) => file.match(/\d/g) !== null);

  if (files.length === 0) {
    console.error('Aucun fichier PDF trouvé dans le répertoire.');
    return;
  }

  let currentPage = null;
  let itemCount = 0; // Compteur global pour savoir où placer chaque page A5

  for (const file of files) {
    try {
      const filePath = path.join(directory, file);
      const pdfBytes = fs.readFileSync(filePath);
      const inputPdf = await PDFDocument.load(pdfBytes);

      const inputPage = inputPdf.getPage(0); // Charger la première page
      const { width, height } = inputPage.getSize();
      console.log(width, height);

      let rotation = pageSize === 'A4' ? degrees(0) : degrees(90);

      const embeddedPage = await outputPdf.embedPage(inputPage);

      if (itemCount % (pageSize === 'A5' ? 2 : 4) === 0) {
        currentPage = outputPdf.addPage([format.width, format.height]);
      }

      const positionIndex = itemCount % (pageSize === 'A5' ? 2 : 4);
      let x = 0;
      let y = 0;

      if (pageSize === 'A4') {
        // Haut Gauche
        if (positionIndex === 0) {
          x = format.width / 2;
          y = format.height / 2;
          // Bas Gauche
        } else if (positionIndex === 1) {
          x = format.width / 2;
          y = 0;
          // Haut Droite
        } else if (positionIndex === 2) {
          x = format.width;
          y = (format.height - height) / 2 + height / 2;
          // Bas Droite
        } else if (positionIndex === 3) {
          x = format.width;
          y = 0;
        }
      } else {
        if (positionIndex === 0) {
          x = (format.width - width) / 2;
          y = format.height - height - margin;
        } else if (positionIndex === 1) {
          x = (format.width - width) / 2;
          y = format.height / 2 - height - margin;
        }
      }

      currentPage.drawPage(embeddedPage, {
        x,
        y,
        width: width,
        height: height,
        rotate: rotation,
      });

      itemCount++;
    } catch (error) {
      console.error(`Erreur lors du traitement du fichier ${file}:`, error.message);
    }
  }

  try {
    const pdfBytes = await outputPdf.save();
    fs.writeFileSync(outputPath, pdfBytes);
    console.log(`Etiquettes mis en page enregistré sous:`, outputPath);
  } catch (error) {
    console.error('Erreur lors de la sauvegarde du fichier PDF :', error.message);
  }
}

const directoryPath = path.join(__dirname, '../public/PRINTSA#28 JANV 2025'); // Répertoire contenant les PDF A5
const outputFilePath = directoryPath + '/Etiquettes' + '/Etiquettes.pdf'; // Nom du fichier PDF généré
(async function () {
  try {
    await generateStickers(arr, directoryPath + '/' + 'Etiquettes');
    await createStickersPage(directoryPath + '/Etiquettes', outputFilePath, 'A5').catch((error) => console.log(error));
  } catch (error) {
    console.log(error);
  }
})();

// module.exports = { generateStickers, createStickersPage };
