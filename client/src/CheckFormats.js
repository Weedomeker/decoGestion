function checkFormats(formatTauro, formatVisu) {
  let widthTauro;
  let heightTauro;
  let widthVisu;
  let heightVisu;

  let checked = {
    isChecked: false,
    gap: false,
    surface: 0,
  };

  if (formatTauro && formatTauro !== '') {
    const [width, height] = formatTauro.split('_').pop().split('x');
    widthTauro = parseInt(width);
    heightTauro = parseInt(height);
  } else {
    return;
  }

  if (formatVisu && formatVisu !== '') {
    const [width, height] = formatVisu.split('_').pop().split('x');
    widthVisu = parseInt(width);
    heightVisu = parseInt(height);
  } else {
    return;
  }

  if (widthVisu > widthTauro || heightVisu > heightTauro) {
    checked.isChecked = false;
  } else {
    checked.isChecked = true;
  }

  let surfaceAreaVisu = widthVisu * heightVisu;
  let surfaceAreaTauro = widthTauro * heightTauro;
  let surfaceArea = parseFloat((surfaceAreaTauro - surfaceAreaVisu) / 10000);

  if (surfaceArea > 2) {
    checked.gap = true;
    checked.surface = surfaceArea;
  } else {
    checked.gap = false;
    checked.surface = surfaceArea;
  }
  return checked;
}

export default checkFormats;
