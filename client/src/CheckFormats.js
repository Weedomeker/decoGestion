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
    widthTauro = parseFloat(width);
    heightTauro = parseFloat(height);
  } else {
    return;
  }

  if (formatVisu && formatVisu !== '') {
    const [width, height] = formatVisu.split('_').pop().split('x');
    widthVisu = parseFloat(width);
    heightVisu = parseFloat(height);
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

  if (surfaceArea > 0) {
    checked.gap = true;
    checked.surface = surfaceArea;
    console.log('TRUE: ', surfaceArea);
  } else {
    checked.gap = false;
    checked.surface = surfaceArea;
    console.log('FALSE: ', surfaceArea);
  }
  return checked;
}

export default checkFormats;
