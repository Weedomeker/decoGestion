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

export default { cmToPoints, pointsToCm, inchToPoints, pointsToInch };
