// Filtre MongoDB de l'historique (GET /history et /history/export).
const { escapeRegExp, texte, regexLitterale } = require("./rechercheTexte");

function buildHistoryFilter(query = {}) {
  const filter = {};

  // Saisie échappée : « ( » ou « * » sont cherchés tels quels, sans planter la regex.
  const client = texte(query.client);
  if (client) filter.client = new RegExp(`^${escapeRegExp(client)}$`, "i");

  const from = texte(query.from);
  const to = texte(query.to);
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }

  const q = texte(query.q);
  if (q) {
    const textRegex = regexLitterale(q);
    const orClauses = [{ mag: textRegex }, { deco: textRegex }, { ref: textRegex }];
    if (/^\d+$/.test(q)) orClauses.push({ numCmd: Number(q) });
    filter.$or = orClauses;
  }

  return filter;
}

module.exports = { buildHistoryFilter, escapeRegExp };
