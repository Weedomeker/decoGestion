const logger = require("../logger/logger");
const dossierService = require("../gamesys/services/dossierService");
const dbConfig = require("../gamesys/config/db");
const { closeConnection } = require("../gamesys/lib/db");
const Deco = require("../models/Deco");

// Bascule status:"A lancer" -> "Annulé" sur les stubs Gamesys proactifs (gamesysStub:true, cf.
// decoGamesysStubSyncService.js) dont la commande a été annulée depuis dans Gamesys. Porte sur
// TOUS les stubs "A lancer" existants (pas de fenêtre glissante) : un stub peut rester en attente
// plusieurs jours avant d'être réclamé par l'utilisateur, et une annulation peut survenir bien
// après la création du stub — cf. dossierService.checkAnnulations pour la règle de détection.
async function syncAnnulationsDepuisGamesys({ dryRun = false } = {}) {
  const stubs = await Deco.find({ gamesysStub: true, status: "A lancer" }).lean();

  const resume = { candidats: stubs.length, annules: 0, erreurs: 0 };
  if (stubs.length === 0) return resume;

  const sousDossiersDuStub = (stub) => (stub.pkOnly ? stub.sousDossiers || [] : [stub.sousDossier].filter(Boolean));

  const numeros = new Set();
  for (const stub of stubs) {
    for (const sousDossier of sousDossiersDuStub(stub)) {
      numeros.add(`${stub.numCmd}/${sousDossier}`);
    }
  }

  const connection = await dbConfig.getDbConnection();
  let annulesSet;
  try {
    annulesSet = new Set(await dossierService.checkAnnulations(connection, [...numeros]));
  } catch (err) {
    logger.warn(`syncAnnulationsDepuisGamesys: échec requête Gamesys : ${err.message}`);
    resume.erreurs = stubs.length;
    return resume;
  } finally {
    await closeConnection(connection);
  }

  for (const stub of stubs) {
    const sousDossiers = sousDossiersDuStub(stub);
    // pkOnly agrège plusieurs sous-dossiers dans un seul stub : on n'annule que si TOUS sont
    // annulés côté Gamesys, pour ne jamais masquer une commande partiellement encore active.
    const toutAnnule = sousDossiers.length > 0 && sousDossiers.every((sd) => annulesSet.has(`${stub.numCmd}/${sd}`));
    if (!toutAnnule) continue;

    resume.annules += 1;
    if (!dryRun) {
      await Deco.updateOne({ _id: stub._id }, { $set: { status: "Annulé" } });
    }
  }

  return resume;
}

module.exports = { syncAnnulationsDepuisGamesys };
