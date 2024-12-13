const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const sizeOf = require('image-size'); // Pour obtenir les dimensions des images

function createPDFWithImagesInLines(directory, outputFile) {
  const files = fs.readdirSync(directory);

  // Filtrer uniquement les fichiers d'image supportés
  const supportedExtensions = ['.jpg', '.jpeg', '.png'];
  const images = files
    .filter((file) => supportedExtensions.includes(path.extname(file).toLowerCase()))
    .map((file) => path.join(directory, file))
    .sort(); // Chemin complet des fichiers

  if (images.length === 0) {
    console.log('Aucune image trouvée dans le répertoire.');
    return;
  }

  // Créer un nouveau document PDF
  const doc = new PDFDocument({ autoFirstPage: false });
  const stream = fs.createWriteStream(outputFile);
  doc.pipe(stream);

  const pageWidth = 595.28; // Largeur de la page A4 en points (portrait)
  const pageHeight = 841.89; // Hauteur de la page A4 en points
  const margin = 50; // Marges autour de la page
  const availableWidth = pageWidth - 2 * margin;
  const availableHeight = pageHeight - 2 * margin;

  let currentX = margin;
  let currentY = margin;

  const textHeight = 20; // Hauteur approximative du texte sous chaque image (en points)
  let maxHeightInRow = 0; // Garde la hauteur maximale d'une image sur la ligne actuelle

  doc.addPage({ size: [pageWidth, pageHeight] }); // Ajouter la première page

  images.forEach((imagePath) => {
    console.log(`Traitement de l'image : ${imagePath}`);

    if (!fs.existsSync(imagePath)) {
      console.error(`Le fichier ${imagePath} n'existe pas. Ignoré.`);
      return;
    }

    // Vérifiez si l'image est valide
    let dimensions;
    try {
      dimensions = sizeOf(imagePath);
      console.log(`Dimensions de l'image : ${dimensions.width}x${dimensions.height}`);
    } catch (error) {
      console.error(`Impossible de lire les dimensions de l'image ${imagePath}:`, error.message);
      return;
    }

    const imgWidth = dimensions.width;
    const imgHeight = dimensions.height;

    // Si l'image ne tient pas dans la largeur restante, passer à une nouvelle ligne
    if (currentX + imgWidth > availableWidth) {
      currentX = margin; // Retourner à gauche
      currentY += maxHeightInRow + textHeight + 10; // Passer à la ligne suivante
      maxHeightInRow = 0; // Réinitialiser la hauteur maximale pour la nouvelle ligne
    }

    // Si l'image et son texte ne tiennent pas dans la hauteur restante, passer à une nouvelle page
    if (currentY + imgHeight + textHeight > availableHeight) {
      doc.addPage({ size: [pageWidth, pageHeight] });
      currentX = margin;
      currentY = margin;
      maxHeightInRow = 0;
    }

    // Dessiner l'image
    try {
      doc.image(imagePath, currentX, currentY);
    } catch (error) {
      console.error(`Erreur lors de l'ajout de l'image ${imagePath}:`, error.message);
      return;
    }

    // Ajouter le texte sous l'image
    const fileName = path.basename(imagePath); // Nom du fichier
    const textY = currentY + imgHeight + 5; // Position Y pour le texte
    try {
      doc.fontSize(4).text(fileName, currentX, textY, { width: imgWidth, height: imgHeight, align: 'center' });
    } catch (error) {
      console.error(`Erreur lors de l'ajout du texte sous l'image ${imagePath}:`, error.message);
    }

    // Mettre à jour la position X pour la prochaine image
    currentX += imgWidth + 10; // Ajouter un espace de 10 points entre les images
    maxHeightInRow = Math.max(maxHeightInRow, imgHeight); // Mettre à jour la hauteur maximale sur la ligne actuelle
  });

  // Finaliser le document PDF
  doc.end();

  // Gérer la fin de l'écriture du fichier
  stream.on('finish', () => {
    console.log('PDF créé avec succès:', outputFile);
  });
}

// Exemple d'utilisation
const directoryPath = path.join(__dirname, '../public/PRINTSA#13 DÉC 2024/QRCodes'); // Remplacez par le chemin réel de votre répertoire
const outputPDF = 'output.pdf'; // Nom du fichier PDF généré

createPDFWithImagesInLines(directoryPath, outputPDF);
