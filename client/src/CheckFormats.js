function checkFormats(formatTauro, formatVisu) {
  // Si l'un des paramètres est manquant, retourner des valeurs par défaut
  if (!formatTauro || !formatVisu) return { isChecked: false, gap: false, surface: 0 };

  const parseDimensions = (format) => {
    let [width, height] = [];
    const regex = format.match(/\d{0,}[x]\d{0,}/gi);
    if (regex) {
      if (regex.length > 1) {
        [width, height] = regex[regex.length - 1].split(/x/i);
      } else {
        [width, height] = regex[0].split(/x/i);
      }
      return [parseFloat(width), parseFloat(height)];
    } else {
      return [];
    }
  };

  let [widthTauro, heightTauro] = parseDimensions(formatTauro);
  let [widthVisu, heightVisu] = parseDimensions(formatVisu);

  // Vérification des unités (conversion mm en cm si nécessaire)
  if (heightVisu && heightVisu.toString().length > 3) {
    heightVisu = heightVisu / 10;
    widthVisu = widthVisu / 10;
  }

  // Initialisation des variables avec des valeurs par défaut
  let surface = 0; // Toujours un nombre
  let isChecked = false;
  let gap = false;

  // Calculs si les dimensions sont valides
  if (!isNaN(widthVisu) && !isNaN(heightVisu) && !isNaN(widthTauro) && !isNaN(heightTauro)) {
    isChecked = widthVisu <= widthTauro && heightVisu <= heightTauro;
    const surfaceAreaTauro = widthTauro * heightTauro; // Surface de formatTauro en cm²
    const surfaceAreaVisu = widthVisu * heightVisu; // Surface de formatVisu en cm²
    surface = (surfaceAreaTauro - surfaceAreaVisu) / 10000; // Conversion cm² → m²

    // Arrondi à deux décimales
    surface = parseFloat(surface.toFixed(2)); // Toujours un nombre, même si négatif
    gap = surface > 1; // Écart supérieur à 1 m²
  }

  // Retour des valeurs calculées ou par défaut
  return { isChecked, gap, surface };
}

export default checkFormats;
