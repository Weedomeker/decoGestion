function checkFormats(formatTauro, formatVisu) {
  let widthTauro;
  let heightTauro;
  let widthVisu;
  let heightVisu;

  let checked = {
    isChecked: false,
    gap: false,
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
  let surfaceArea = (surfaceAreaTauro - surfaceAreaVisu) / 100;

  if (surfaceArea > 100) {
    checked.gap = true;
  } else {
    checked.gap = false;
  }
  console.log(surfaceArea);
  return checked;
}

export default checkFormats;
