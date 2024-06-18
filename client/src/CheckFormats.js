function checkFormats(formatTauro, formatVisu) {
  if (!formatTauro || !formatVisu) return;

  const parseDimensions = (format) => {
    const [width, height] = format.split('_').pop().split('x');
    return [parseFloat(width), parseFloat(height)];
  };

  const [widthTauro, heightTauro] = parseDimensions(formatTauro);
  const [widthVisu, heightVisu] = parseDimensions(formatVisu);

  const isChecked = widthVisu <= widthTauro && heightVisu <= heightTauro;
  const surfaceAreaTauro = widthTauro * heightTauro; // in cm²
  const surfaceAreaVisu = widthVisu * heightVisu; // in cm²
  let surface = (surfaceAreaTauro - surfaceAreaVisu) / 10000; // convert cm² to m²

  if (surface < 1) {
    surface = Math.round(surface * 100) / 100; // round to two decimal places
  }

  const gap = surface > 1;

  return { isChecked, gap, surface, unit: 'm²' };
}

export default checkFormats;
