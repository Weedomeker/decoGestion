const pLimit = require("p-limit");
const logger = require("../logger/logger");
const dossierService = require("../gamesys/services/dossierService");
const dbConfig = require("../gamesys/config/db");
const { closeConnection } = require("../gamesys/lib/db");
const Deco = require("../models/Deco");
const { buildCoteClientComment } = require("../utils/coteClient");

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

  // Un seul aller-retour Mongo ($in) au lieu d'un Deco.exists() par candidat : au démarrage
  // la quasi-totalité des candidats est déjà en base, cette boucle N faisait N round-trips
  // avant toute connexion ODBC.
  const numCmdParCandidat = candidats
    .map((c) => ({ candidat: c, numCmd: parseInt(c.cmd, 10) }))
    .filter((x) => x.numCmd && !Number.isNaN(x.numCmd));

  const numCmds = [...new Set(numCmdParCandidat.map((x) => x.numCmd))];
  const dejaEnBase = new Set(
    (await Deco.find({ numCmd: { $in: numCmds } }, { numCmd: 1 }).lean()).map((d) => d.numCmd),
  );

  for (const { candidat, numCmd } of numCmdParCandidat) {
    if (dejaEnBase.has(numCmd)) {
      resume.dejaExistants += 1;
      continue;
    }
    aTraiter.push({ ...candidat, numCmd });
  }

  if (dryRun || aTraiter.length === 0) return resume;

  const limit = pLimit(concurrency);
  await Promise.all(
    aTraiter.map((candidat) =>
      limit(async () => {
        // Connexion dédiée par candidat plutôt que partagée entre les `concurrency` candidats
        // traités en parallèle : une connexion ODBC ne supporte pas des requêtes concurrentes qui
        // se chevauchent (le pool, cf. gamesys/config/db.js, est dimensionné pour ça — maxSize=10).
        // Partager une seule connexion faisait échouer silencieusement fetchSousDossiersVisuels sous
        // charge (gros batch de rattrapage) : la résolution par sous-dossier retombait sur le stub
        // "métadonnées commande" sans ref/deco/format, alors que les données existaient bien côté
        // Gamesys (vérifié en rejouant la résolution en séquentiel après coup).
        const connection = await dbConfig.getDbConnection();
        try {
          // prixTotal vient de commandeInfo (fetchDossierCommandeInfo interroge aussi endv_px_total
          // désormais — fusionné avec l'ancien fetchDossierPrixTotal, même table/WHERE) plutôt que
          // d'un aller-retour ODBC séparé.
          const commandeInfo = await dossierService.fetchDossierCommandeInfo(connection, candidat.cmd);
          const formatPlaqueGamesys = await dossierService.fetchDossierFormatPlaque(connection, candidat.cmd);
          const prixTotal = commandeInfo?.prixTotal ?? null;
          const { dateLivraisonSouhaitee, magasin, ville, magasinRef, villeRef } =
            await dossierService.fetchDossierLivraisonDates(connection, candidat.cmd);
          // mag = ville de livraison (repère magasin pour LM/CASTO/BRICO), ou nom du destinataire
          // pour ECOM (livraison directe au client final, pas de notion de magasin) — repli sur
          // l'autre valeur si celle attendue en priorité est absente. Pour les enseignes physiques,
          // repli supplémentaire sur fc_references (villeRef/magasinRef) : un stub est souvent créé
          // avant que la ligne ff_livraison n'existe, fc_references résout le magasin dès maintenant.
          const mag =
            candidat.client === "ECOM" ? magasin || ville : ville || magasin || villeRef || magasinRef;

          const commandeCommune = {
            client: candidat.client,
            date: new Date(),
            status: "A lancer",
            gamesysStub: true,
            ...commandeInfo,
            formatPlaqueGamesys,
            // dibond = format plaque, même donnée Gamesys que formatPlaqueGamesys (dos_supp_1_ft,
            // ex: "1260 x 2600" en mm brut) — converti en cm sans espace ("126x260") via
            // extractDimensionFormat pour matcher la convention des dibond saisis manuellement
            // (vérifié en base : "126x260", "101x215", ...), pas le format Gamesys brut.
            dibond: dossierService.extractDimensionFormat(formatPlaqueGamesys) || undefined,
            mag: mag || undefined,
            prixTotal: prixTotal ?? undefined,
            dateLivraisonSouhaitee: dateLivraisonSouhaitee ?? undefined,
          };

          let sousDossiersVisuels = [];
          try {
            sousDossiersVisuels = await dossierService.fetchSousDossiersVisuels(connection, candidat.cmd);
          } catch (err) {
            logger.warn(
              `syncDecoStubsDepuisGamesys: sous-dossiers visuels non résolus pour numCmd=${candidat.numCmd} : ${err.message}`,
            );
          }

          if (sousDossiersVisuels.length === 0) {
            // Un autre chemin (saveDeco/saveProfilsKits) a pu créer le document entre le scan
            // ci-dessus et cet appel (course possible sur des dossiers traités quasi immédiatement) —
            // upsert idempotent plutôt que create() pour éviter un doublon/E11000 dans ce cas.
            // Aucun visuel résolu mais des profils/kits présents (nombreProfil/nombreKitPose > 0,
            // cf. commandeInfo) : la commande est en réalité 100% accessoires (aucun panneau dibond),
            // pas un visuel non résolu — pkOnly:true pour que ce stub soit repris par les backfills
            // dédiés pkOnly (pkOnlyPrixBackfillService, decoSousDossiersPkOnlyBackfillService) au lieu
            // de rester étiqueté comme un job visuel vide.
            const pkOnly = (commandeInfo?.nombreProfil ?? 0) > 0 || (commandeInfo?.nombreKitPose ?? 0) > 0;
            await Deco.findOneAndUpdate(
              { numCmd: candidat.numCmd },
              { $setOnInsert: { numCmd: candidat.numCmd, ...commandeCommune, pkOnly } },
              { upsert: true },
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
              // (M)") n'est pas toujours un code SKU exploitable — ne poser `ref` (qui nécessite le
              // catalogue interne, utilisé ensuite comme clé de résolution/stock) que si elle a été
              // validée contre RefDeco/RefCasto/RefBrico/RefEcom. format/finition/deco ont chacun un
              // repli Gamesys direct qui ne dépend pas de ce catalogue (dos_forme_et_format /
              // dos_imp_1_fac_p_1 via printFinish / libellé fs_stock brut, cf.
              // fetchSousDossiersVisuels) — moins précis que le catalogue (pas de nuance "texture
              // Pierre" par ex., ni de ref exploitable) mais toujours une donnée Gamesys fiable,
              // pour que le stub "A lancer" affiche déjà un maximum d'infos avant tout traitement.
              const finitionRepli =
                sousDossier.printFinish === "MAT"
                  ? "Mat"
                  : sousDossier.printFinish === "BRILLANT"
                    ? "Brillant"
                    : undefined;
              // Panneau sur-mesure (sfamille SMES) : la référence Gamesys est du texte libre jamais
              // présent au catalogue interne, donc refFields ne matche jamais. Mais fetchSousDossiersVisuels
              // a déjà résolu le nom propre ("ARCHE BEIGE"), le format fini et l'orientation — on les pose
              // tels quels. Pour la finition en revanche on prend le VERNIS Mat/Brillant (finitionRepli,
              // issu de dos_imp_1_fac_p_1) et non la texture du gabarit ("LISSE"/"TEXTUREE" via
              // visuel.finition) : le vernis est la finition métier pertinente, la texture n'est qu'une
              // option de support (voir aussi smesFinitionBackfillService). Repli sur le gabarit
              // seulement si aucun vernis n'est renseigné. La cote client exacte (souvent décimale) va
              // en commentaire.
              const isSurMesure = !!visuel.surMesure;
              const champsVisuel = refFields.matched
                ? {
                    ref: visuel.reference,
                    finition: refFields.finition,
                    format: refFields.format,
                    deco: refFields.deco,
                  }
                : isSurMesure
                  ? {
                      format: visuel.format || sousDossier.formatFini || undefined,
                      finition: finitionRepli || visuel.finition,
                      deco: visuel.deco || visuel.libelle || undefined,
                    }
                  : {
                      format: sousDossier.formatFini || undefined,
                      finition: finitionRepli,
                      deco: visuel.libelle || undefined,
                    };
              const champsSurMesure = isSurMesure
                ? {
                    surMesure: true,
                    surMesureKind: visuel.surMesureKind || undefined,
                    orientation: visuel.orientation || undefined,
                    comment: buildCoteClientComment(visuel.printFormat, ""),
                  }
                : {};
              await Deco.findOneAndUpdate(
                { numCmd: candidat.numCmd, sousDossier: sousDossier.sousNumero },
                {
                  $setOnInsert: {
                    numCmd: candidat.numCmd,
                    sousDossier: sousDossier.sousNumero,
                    prix: visuel.endv_px_total ?? undefined,
                    ex: visuel.endv_quant != null ? Number(visuel.endv_quant) : undefined,
                    ...champsVisuel,
                    ...champsSurMesure,
                    ...commandeCommune,
                  },
                },
                { upsert: true },
              );
              crees += 1;
            } catch (err) {
              resume.erreurs += 1;
              logger.warn(
                `syncDecoStubsDepuisGamesys: échec numCmd=${candidat.numCmd} sousDossier=${sousDossier.sousNumero} : ${err.message}`,
              );
            }
          }
          resume.crees += crees;
        } catch (err) {
          resume.erreurs += 1;
          logger.warn(`syncDecoStubsDepuisGamesys: échec numCmd=${candidat.numCmd} : ${err.message}`);
        } finally {
          await closeConnection(connection);
        }
      }),
    ),
  );

  return resume;
}

module.exports = { syncDecoStubsDepuisGamesys };
