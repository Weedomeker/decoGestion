// convertUnits.js

// Conversion d'unité cm -> points
function cmToPoints(cm) {
  return cm * 28.3464567;
}

// Conversion d'unité points -> cm
function pointsToCm(points) {
  return points / 28.3464567;
}

// Conversion d'unité inch -> points
function inchToPoints(inch) {
  return inch * 72;
}

// Conversion d'unité points -> inch
function pointsToInch(points) {
  return points / 72;
}

function cmToPxl(cm) {
  return (96 * cm) / 2.54;
}

module.exports = { cmToPoints, pointsToCm, inchToPoints, pointsToInch, cmToPxl };
