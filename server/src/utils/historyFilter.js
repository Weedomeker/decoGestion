// Filtre MongoDB de l'historique (GET /history et /history/export).
const { escapeRegExp, texte, regexLitterale } = require("./rechercheTexte");

// « 2026-11-17 » (champ date du navigateur) : début ou fin de ce jour en heure locale.
// new Date("2026-11-17") vaut minuit UTC : « Au 17/11 » excluait les jobs du 17.
function borneJour(valeur, finDeJournee) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  if (!m) return new Date(valeur);
  const [, a, mo, j] = m.map(Number);
  return finDeJournee ? new Date(a, mo - 1, j, 23, 59, 59, 999) : new Date(a, mo - 1, j, 0, 0, 0, 0);
}

function buildHistoryFilter(query = {}) {
  const filter = {};

  // Saisie échappée : « ( » ou « * » sont cherchés tels quels, sans planter la regex.
  const client = texte(query.client);
  if (client) filter.client = new RegExp(`^${escapeRegExp(client)}$`, "i");

  const from = texte(query.from);
  const to = texte(query.to);
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = borneJour(from, false);
    if (to) filter.date.$lte = borneJour(to, true);
  }

  const q = texte(query.q);
  if (q) {
    const textRegex = regexLitterale(q);
    const orClauses = [{ mag: textRegex }, { deco: textRegex }, { ref: textRegex }];
    if (/^\d+$/.test(q)) {
      orClauses.push({ numCmd: Number(q) });
      // Numéro partiel (« 1693 » → 169397…) : les suggestions de l'onglet Sticker partent dès 2 chiffres.
      orClauses.push({
        $expr: { $regexMatch: { input: { $toString: { $ifNull: ["$numCmd", ""] } }, regex: `^${q}` } },
      });
    }
    filter.$or = orClauses;
  }

  return filter;
}

module.exports = { buildHistoryFilter, escapeRegExp };
