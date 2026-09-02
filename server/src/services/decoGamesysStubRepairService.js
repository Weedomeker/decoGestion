const Deco = require("../models/Deco");
// Module require (pas de destructuring) pour que syncGamesysExtraction reste stubbable en test.
const gamesysExtractionSyncService = require("./gamesysExtractionSyncService");

// Supprime puis reconstruit les stubs Gamesys (gamesysStub:true) tombés dans le repli "métadonnées
// commande" (pas de sousDossier, deco/format vides) à cause du bug de connexion ODBC partagée
// désormais corrigé dans gamesysExtractionSyncService (ex-decoGamesysStubSyncService) — ces stubs
// avaient échoué à résoudre leurs
// sous-dossiers visuels alors que les données existaient bien côté Gamesys. Suppression sans risque :
// ces stubs sont par définition non réclamés (gamesysStub:true) et claimStubOrCreate (decoStubService.js)
// les réclame par numCmd/sousDossier, jamais par _id — les recréer avec un nouvel _id ne casse rien.
async function repairDecoGamesysStubs({ sinceDate, dryRun = true } = {}) {
  const candidats = await Deco.find({
    gamesysStub: true,
    sousDossier: { $exists: false },
    deco: { $in: [null, ""] },
    format: { $in: [null, ""] },
  })
    .select({ numCmd: 1 })
    .lean();

  const resume = {
    candidats: candidats.length,
    numCmds: candidats.map((c) => c.numCmd),
    supprimes: 0,
    resync: null,
  };

  if (dryRun || candidats.length === 0) return resume;

  const { deletedCount } = await Deco.deleteMany({ _id: { $in: candidats.map((c) => c._id) } });
  resume.supprimes = deletedCount;
  resume.resync = await gamesysExtractionSyncService.syncGamesysExtraction({ sinceDate });

  return resume;
}

module.exports = { repairDecoGamesysStubs };
