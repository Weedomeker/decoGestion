/**
 * The function `checkFormats` compares two formats and calculates the surface area difference in
 * square meters.
 * @param formatTauro - The `formatTauro` parameter represents the format of a Tauro object, typically
 * in the format "width_height". For example, it could be "10x20" representing a Tauro object with a
 * width of 10 units and a height of 20 units.
 * @param formatVisu - The `formatVisu` parameter represents the dimensions of a visual element. It is
 * expected to be in the format "width_height" where width and height are in centimeters.
 * @returns The function `checkFormats` is returning an object with three properties: `isChecked`,
 * `gap`, and `surface`.
 */

function checkFormats(formatTauro, formatVisu) {
  if (!formatTauro || !formatVisu) return;

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

  return { isChecked, gap, surface };
}

export default checkFormats;
