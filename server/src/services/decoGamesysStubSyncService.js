const pLimit = require("p-limit");
const logger = require("../logger/logger");
const dossierService = require("../gamesys/services/dossierService");
const dbConfig = require("../gamesys/config/db");
const { closeConnection } = require("../gamesys/lib/db");
const Deco = require("../models/Deco");

// Crée proactivement des documents Deco (gamesysStub:true) pour chaque dossier Gamesys récent qui
// n'a pas encore de document Deco, avant toute action utilisateur — sur le modèle de
// syncConsommationsHistorique (gamesysConsommationSyncService.js). Un stub par sous-dossier visuel
// résolu (ref/format/finition/prix propres, cf. dossierService.fetchSousDossiersVisuels), pour
// qu'une commande à plusieurs panneaux différents obtienne un stub précis par panneau ; à défaut
// (aucun visuel résolu — profils/kits seuls, ou dossier trop ancien pour Gamesys, cf. limite de
// récence documentée), un seul stub "métadonnées commande" comme avant. L'utilisateur réclame
// ensuite le stub correspondant via claimStubOrCreate (decoStubService.js) quand il traite un job.
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
            const { dateLivraisonSouhaitee, magasin, ville } = await dossierService.fetchDossierLivraisonDates(
              connection,
              candidat.cmd
            );
            // mag = ville de livraison (repère magasin pour LM/CASTO/BRICO), ou nom du destinataire
            // pour ECOM (livraison directe au client final, pas de notion de magasin) — repli sur
            // l'autre valeur si celle attendue en priorité est absente.
            const mag = candidat.client === "ECOM" ? magasin || ville : ville || magasin;

            const commandeCommune = {
              client: candidat.client,
              date: new Date(),
              status: "",
              gamesysStub: true,
              ...commandeInfo,
              formatPlaqueGamesys,
              // dibond = format plaque, même donnée Gamesys que formatPlaqueGamesys (dos_supp_1_ft).
              dibond: formatPlaqueGamesys || undefined,
              mag: mag || undefined,
              prixTotal: prixTotal ?? undefined,
              dateLivraisonSouhaitee: dateLivraisonSouhaitee ?? undefined,
            };

            let sousDossiersVisuels = [];
            try {
              sousDossiersVisuels = await dossierService.fetchSousDossiersVisuels(connection, candidat.cmd);
            } catch (err) {
              logger.warn(
                `syncDecoStubsDepuisGamesys: sous-dossiers visuels non résolus pour numCmd=${candidat.numCmd} : ${err.message}`
              );
            }

            if (sousDossiersVisuels.length === 0) {
              // Un autre chemin (saveDeco/saveProfilsKits) a pu créer le document entre le scan
              // ci-dessus et cet appel (course possible sur des dossiers traités quasi immédiatement) —
              // upsert idempotent plutôt que create() pour éviter un doublon/E11000 dans ce cas.
              await Deco.findOneAndUpdate(
                { numCmd: candidat.numCmd },
                { $setOnInsert: { numCmd: candidat.numCmd, ...commandeCommune } },
                { upsert: true }
              );
              resume.crees += 1;
              return;
            }

            let crees = 0;
            for (const sousDossier of sousDossiersVisuels) {
              try {
                const visuel = sousDossier.visualReferences[0];
                const refFields = (await Deco.resolveRefFields(candidat.client, visuel.reference)) || {
                  matched: false,
                };
                // La référence Gamesys brute (texte libellé fs_stock, ex: "Jaspe Gauche 100 x 210 cm
                // (M)") n'est pas toujours un code SKU exploitable — ne poser ref/deco (qui nécessitent
                // le catalogue interne) que si elle a été validée contre RefDeco/RefCasto/RefBrico/
                // RefEcom. format/finition ont un repli Gamesys direct qui ne dépend pas de ce
                // catalogue (dos_forme_et_format / dos_imp_1_fac_p_1 via printFinish, cf.
                // fetchSousDossiersVisuels) — moins précis que le catalogue (pas de nuance
                // "texture Pierre" par ex.) mais toujours une donnée Gamesys fiable.
                const finitionRepli = sousDossier.printFinish === "MAT" ? "Mat" : sousDossier.printFinish === "BRILLANT" ? "Brillant" : undefined;
                const champsVisuel = refFields.matched
                  ? { ref: visuel.reference, finition: refFields.finition, format: refFields.format, deco: refFields.deco }
                  : { format: sousDossier.formatFini || undefined, finition: finitionRepli };
                await Deco.findOneAndUpdate(
                  { numCmd: candidat.numCmd, sousDossier: sousDossier.sousNumero },
                  {
                    $setOnInsert: {
                      numCmd: candidat.numCmd,
                      sousDossier: sousDossier.sousNumero,
                      prix: visuel.endv_px_total ?? undefined,
                      ex: visuel.endv_quant != null ? Number(visuel.endv_quant) : undefined,
                      ...champsVisuel,
                      ...commandeCommune,
                    },
                  },
                  { upsert: true }
                );
                crees += 1;
              } catch (err) {
                resume.erreurs += 1;
                logger.warn(
                  `syncDecoStubsDepuisGamesys: échec numCmd=${candidat.numCmd} sousDossier=${sousDossier.sousNumero} : ${err.message}`
                );
              }
            }
            resume.crees += crees;
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
