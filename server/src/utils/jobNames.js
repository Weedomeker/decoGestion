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

module.exports = {
  castoName,
};
