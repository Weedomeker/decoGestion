const Deco = require("../models/Deco");

// Corrige status:"" -> "A lancer" sur les stubs Gamesys proactifs (gamesysStub:true) créés avant
// que decoGamesysStubSyncService.js ne pose status:"A lancer" dès la création. Filtré sur
// gamesysStub:true pour ne jamais toucher un stub déjà réclamé : son status:"" signifie "traité
// avec succès" (cf. saveDeco / profilsKitsService.js), pas "en attente". Purement Mongo-à-Mongo,
// aucun appel Gamesys nécessaire.
async function backfillDecoStatusALancer({ dryRun = false } = {}) {
  const filter = { gamesysStub: true, status: "" };
  const candidats = await Deco.countDocuments(filter);

  if (dryRun || candidats === 0) return { candidats, misAJour: 0 };

  const { modifiedCount } = await Deco.updateMany(filter, { $set: { status: "A lancer" } });
  return { candidats, misAJour: modifiedCount };
}

module.exports = { backfillDecoStatusALancer };
