// "86.9x201.5" -> "Cote client : 86,9 × 201,5 cm", concaténé à un commentaire existant.
function buildCoteClientComment(printFormat, existingComment = "") {
  if (!printFormat) return existingComment || "";
  const m = String(printFormat).match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/);
  if (!m) return existingComment || "";
  const fr = (n) => String(n).replace(".", ",");
  const cote = `Cote client : ${fr(m[1])} × ${fr(m[2])} cm`;
  return existingComment ? `${existingComment} — ${cote}` : cote;
}

module.exports = { buildCoteClientComment };
