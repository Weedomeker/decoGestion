// Recherche « contient », sans tenir compte de la casse, sur du texte saisi par l'utilisateur.

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Texte non vide, sinon null. Un paramètre répété (?q=a&q=b) arrive en tableau : il est ignoré.
function texte(valeur) {
  return typeof valeur === "string" && valeur.trim() ? valeur.trim() : null;
}

// RegExp qui cherche la saisie telle quelle : « ( », « + » ou « .* » ne sont pas interprétés.
function regexLitterale(valeur) {
  const t = texte(valeur);
  return t ? new RegExp(escapeRegExp(t), "i") : null;
}

module.exports = { escapeRegExp, texte, regexLitterale };
