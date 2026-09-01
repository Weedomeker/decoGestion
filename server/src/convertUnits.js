// convertUnits.js

// Conversion d'unité cm -> points
function cmToPoints(cm) {
  return cm * 28.3464567;
}

// Conversion d'unité points -> cm
function pointsToCm(points) {
  return points / 28.3464567;
}

function cmToPxl(cm) {
  return (96 * cm) / 2.54;
}

module.exports = { cmToPoints, pointsToCm, cmToPxl };
