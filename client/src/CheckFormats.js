function checkFormats(formatTauro, formatVisu, formatVisu2) {
  if (!formatTauro || !formatVisu) {
    return { isChecked: false, gap: false, surface: 0 };
  }

  const parseDimensions = (format) => {
    if (!format) return null;

    const match = format.match(/(\d+)\s*x\s*(\d+)/i);
    if (!match) return null;

    return [Number(match[1]), Number(match[2])];
  };

  let [widthTauro, heightTauro] = parseDimensions(formatTauro) || [];
  let [widthVisu, heightVisu] = parseDimensions(formatVisu) || [];
  let [widthVisu2, heightVisu2] = parseDimensions(formatVisu2) || [];

  // Orientation : largeur ≤ hauteur
  if (widthVisu > heightVisu) {
    [widthVisu, heightVisu] = [heightVisu, widthVisu];
  }

  if (widthVisu2 && widthVisu2 > heightVisu2) {
    [widthVisu2, heightVisu2] = [heightVisu2, widthVisu2];
  }

  // Conversion mm → cm (si valeur > 300 cm)
  const normalizeUnit = (v) => (v > 300 ? v / 10 : v);

  widthVisu = normalizeUnit(widthVisu);
  heightVisu = normalizeUnit(heightVisu);
  widthVisu2 = normalizeUnit(widthVisu2);
  heightVisu2 = normalizeUnit(heightVisu2);

  let isChecked = false;
  let gap = false;
  let surface = 0;

  if (![widthTauro, heightTauro, widthVisu, heightVisu].some((v) => isNaN(v))) {
    const visu1Ok = widthVisu <= widthTauro && heightVisu <= heightTauro;

    const visu2Ok = formatVisu2 ? widthVisu2 <= widthTauro && heightVisu2 <= heightTauro : true;

    isChecked = visu1Ok && visu2Ok;

    const surfaceTauro = widthTauro * heightTauro;
    const surfaceVisu = widthVisu * heightVisu + (formatVisu2 ? widthVisu2 * heightVisu2 : 0);

    surface = (surfaceTauro - surfaceVisu) / 10000;
    surface = Number(surface.toFixed(2));
    console.log(surface);
    gap = surface > 1;
  }

  return { isChecked, gap, surface };
}

export default checkFormats;
