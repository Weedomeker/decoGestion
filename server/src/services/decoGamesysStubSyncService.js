const pLimit = require("p-limit");
const logger = require("../logger/logger");
const dossierService = require("../gamesys/services/dossierService");
const dbConfig = require("../gamesys/config/db");
const { closeConnection } = require("../gamesys/lib/db");
const Deco = require("../models/Deco");

// Crée proactivement un document Deco (gamesysStub:true) pour chaque dossier Gamesys récent qui
// n'a pas encore de document Deco, avant toute action utilisateur — sur le modèle de
// syncConsommationsHistorique (gamesysConsommationSyncService.js), mais un seul stub par dossier
// racine (numCmd), pas par article. L'utilisateur réclame ensuite ce stub via claimStubOrCreate
// (decoStubService.js) quand il traite un job pour ce numCmd.
async function syncDecoStubsDepuisGamesys({ sinceDate, concurrency = 3, dryRun = false } = {}) {
  const candidats = await dossierService.listCommandesRecentes({ sinceDate });

  const resume = { candidats: candidats.length, dejaExistants: 0, crees: 0, erreurs: 0 };
  const aTraiter = [];

  for (const candidat of candidats) {
    const numCmd = parseInt(candidat.cmd, 10);
    if (!numCmd || Number.isNaN(numCmd)) continue;

    const dejaPresent = await Deco.exists({ numCmd });
    if (dejaPresent) {
      resume.dejaExistants += 1;
      continue;
    }
    aTraiter.push({ ...candidat, numCmd });
  }

  if (dryRun || aTraiter.length === 0) return resume;

  const connection = await dbConfig.getDbConnection();
  try {
    const limit = pLimit(concurrency);
    await Promise.all(
      aTraiter.map((candidat) =>
        limit(async () => {
          try {
            const commandeInfo = await dossierService.fetchDossierCommandeInfo(connection, candidat.cmd);
            const formatPlaqueGamesys = await dossierService.fetchDossierFormatPlaque(connection, candidat.cmd);
            const prixTotal = await dossierService.fetchDossierPrixTotal(connection, candidat.cmd);
            const { dateLivraisonSouhaitee } = await dossierService.fetchDossierLivraisonDates(connection, candidat.cmd);

            // Un autre chemin (saveDeco/saveProfilsKits) a pu créer le document entre le scan
            // ci-dessus et cet appel (course possible sur des dossiers traités quasi immédiatement) —
            // upsert idempotent plutôt que create() pour éviter un doublon/E11000 dans ce cas.
            await Deco.findOneAndUpdate(
              { numCmd: candidat.numCmd },
              {
                $setOnInsert: {
                  numCmd: candidat.numCmd,
                  client: candidat.client,
                  date: new Date(),
                  status: "",
                  gamesysStub: true,
                  ...commandeInfo,
                  formatPlaqueGamesys,
                  prixTotal: prixTotal ?? undefined,
                  dateLivraisonSouhaitee: dateLivraisonSouhaitee ?? undefined,
                },
              },
              { upsert: true }
            );
            resume.crees += 1;
          } catch (err) {
            resume.erreurs += 1;
            logger.warn(`syncDecoStubsDepuisGamesys: échec numCmd=${candidat.numCmd} : ${err.message}`);
          }
        }),
      ),
    );
  } finally {
    await closeConnection(connection);
  }

  return resume;
}

module.exports = { syncDecoStubsDepuisGamesys };
