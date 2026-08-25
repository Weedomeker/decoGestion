const Deco = require("../models/Deco");

// Corrige status:"" -> "A imprimer" sur les documents visuels (non-pkOnly) déjà traités par
// l'utilisateur via saveDeco, créés avant que ce chemin ne pose "A imprimer" dès le traitement.
// gamesysStub: { $ne: true } exclut les stubs proactifs encore en attente (status:"A lancer"
// désormais, cf. decoStatusALancerBackfillService.js). pkOnly: { $ne: true } exclut les dossiers
// profils/kits qui doivent recevoir "PK à coliser" (cf. decoStatusPKAColiserBackfillService.js).
// Purement Mongo-à-Mongo, aucun appel Gamesys nécessaire.
async function backfillDecoStatusAImprimer({ dryRun = false } = {}) {
  const filter = { gamesysStub: { $ne: true }, pkOnly: { $ne: true }, status: "" };
  const candidats = await Deco.countDocuments(filter);

  if (dryRun || candidats === 0) return { candidats, misAJour: 0 };

  const { modifiedCount } = await Deco.updateMany(filter, { $set: { status: "A imprimer" } });
  return { candidats, misAJour: modifiedCount };
}

module.exports = { backfillDecoStatusAImprimer };
