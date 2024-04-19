const cmToPxl = (cm = Number, dpi = Number) => {
  let pxl = (cm * dpi) / 2.54
  return parseFloat(pxl.toFixed(0));
}

const pxlToCm = (px = Number, dpi = Number) => {
let cm = (px * 2.54) / dpi
return parseFloat(cm.toFixed(0))
}

module.exports = {cmToPxl, pxlToCm}