const Deco = require("../models/Deco");

// Corrige status:"" -> "A imprimer" sur les documents déjà traités par l'utilisateur (job visuel
// via saveDeco, ou job pkOnly via profilsKitsService.js) créés avant que ces deux chemins ne posent
// "A imprimer" dès le traitement. gamesysStub: { $ne: true } exclut les stubs proactifs encore en
// attente (status:"A lancer" désormais, cf. decoStatusALancerBackfillService.js) : un stub non
// réclamé n'a jamais été traité, donc jamais "A imprimer". Purement Mongo-à-Mongo, aucun appel
// Gamesys nécessaire.
async function backfillDecoStatusAImprimer({ dryRun = false } = {}) {
  const filter = { gamesysStub: { $ne: true }, status: "" };
  const candidats = await Deco.countDocuments(filter);

  if (dryRun || candidats === 0) return { candidats, misAJour: 0 };

  const { modifiedCount } = await Deco.updateMany(filter, { $set: { status: "A imprimer" } });
  return { candidats, misAJour: modifiedCount };
}

module.exports = { backfillDecoStatusAImprimer };
