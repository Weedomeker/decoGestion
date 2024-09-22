const dpi = 72;

const cmToPxl = (cm = Number) => {
  let pxl = (cm * dpi) / 2.54;
  return parseFloat(pxl.toFixed(2));
};

const pxlToCm = (px = Number) => {
  let cm = (px * 2.54) / dpi;
  return parseFloat(cm.toFixed(2));
};

module.exports = { cmToPxl, pxlToCm };
