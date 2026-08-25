const Deco = require("../models/Deco");

// Corrige status:"" ou "A imprimer" -> "PK à coliser" sur les documents pkOnly déjà traités par
// l'utilisateur via profilsKitsService.js, créés avant que ce chemin ne pose "PK à coliser" dès
// le traitement. gamesysStub: { $ne: true } exclut les stubs proactifs encore en attente
// (status:"A lancer", cf. decoStatusALancerBackfillService.js). Purement Mongo-à-Mongo.
async function backfillDecoStatusPKAColiser({ dryRun = false } = {}) {
  const filter = { gamesysStub: { $ne: true }, pkOnly: true, status: { $in: ["", "A imprimer"] } };
  const candidats = await Deco.countDocuments(filter);

  if (dryRun || candidats === 0) return { candidats, misAJour: 0 };

  const { modifiedCount } = await Deco.updateMany(filter, { $set: { status: "PK à coliser" } });
  return { candidats, misAJour: modifiedCount };
}

module.exports = { backfillDecoStatusPKAColiser };
