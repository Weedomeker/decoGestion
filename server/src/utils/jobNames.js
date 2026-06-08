function castoName(name) {
  if (typeof name !== "string" || name === undefined) {
    return;
  }

  return name
    .replace(/\d{3}x\d{3}/gi, "")
    .replace(/cm|CRED|-|\d{13}/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDimensions(format) {
  const [width, height] = format.toLowerCase().split("_").pop().split("x");

  return [parseFloat(width), parseFloat(height)];
}

module.exports = {
  castoName,
  parseDimensions,
};
