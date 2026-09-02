const pLimit = require("p-limit");
const logger = require("../logger/logger");
const dossierService = require("../gamesys/services/dossierService");
const dbConfig = require("../gamesys/config/db");
const { closeConnection } = require("../gamesys/lib/db");
const Deco = require("../models/Deco");
const ConsommationCommande = require("../models/ConsommationCommande");
const { buildCoteClientComment } = require("../utils/coteClient");
const { createBackfillProgressBar } = require("../utils/backfillProgressBar");
// Import via objet module (pas destructuré) pour permettre le stub sinon en test, comme
// gamesysConsommationSyncService.js/decoGamesysStubSyncService.js avant fusion.
const profilsKitsService = require("./profilsKitsService");
const stockArticleReconciliationService = require("./stockArticleReconciliationService");

// Extraction Gamesys unifiée des commandes récentes — fusionne ce que faisaient séparément
// decoGamesysStubSyncService.js (stubs Deco gamesysStub:true par sous-dossier visuel, "A lancer",
// consommé par une appli externe AVANT tout traitement decoGestion) et
// gamesysConsommationSyncService.js (ConsommationCommande pour les profils/kits jamais recherchés
// manuellement dans l'UI, faute de visuel associé). Un seul scan Gamesys (listCommandesRecentes) et,
// par commande candidate, un seul aller-retour Gamesys (fetchDossierGroupedDetail, connexion injectée
// réutilisée pour toute la commande — jamais getDossierDetail en boucle, qui ouvre une connexion PAR
// SOUS-DOSSIER et a saturé le pool ODBC sur des runs de masse, cf. feedback_odbc_backfill_resource_limits)
// au lieu de deux à trois (fetchSousDossiersVisuels + fetchDossierCommandeInfo/FormatPlaque/LivraisonDates
// côté stubs, getDossierDetail côté conso).
async function syncGamesysExtraction({ sinceDate, client, concurrency = 3, dryRun = false } = {}) {
  const candidats = await dossierService.listCommandesRecentes({ sinceDate, client });

  const resume = {
    candidats: candidats.length,
    dejaExistants: 0,
    decoTraites: 0,
    decoErreurs: 0,
    consoTraites: 0,
    consoErreurs: 0,
    erreurs: 0,
  };

  const numCmdParCandidat = candidats
    .map((c) => ({ candidat: c, numCmd: parseInt(c.cmd, 10) }))
    .filter((x) => x.numCmd && !Number.isNaN(x.numCmd));

  const numCmds = [...new Set(numCmdParCandidat.map((x) => x.numCmd))];
  // Deux déduplications indépendantes (Deco / ConsommationCommande) : une commande peut avoir déjà
  // l'une sans l'autre (ex: visuel traité normalement par l'utilisateur, mais ses profils/kits
  // jamais synchronisés faute de recherche manuelle du dossier) — chaque cible est comblée
  // séparément plutôt que de sauter la commande entière dès qu'une des deux existe.
  const [decoExistants, consoExistants] = numCmds.length
    ? await Promise.all([
        Deco.find({ numCmd: { $in: numCmds } }, { numCmd: 1 }).lean().then((rows) => new Set(rows.map((d) => d.numCmd))),
        ConsommationCommande.find({ numCmd: { $in: numCmds } }, { numCmd: 1 })
          .lean()
          .then((rows) => new Set(rows.map((d) => d.numCmd))),
      ])
    : [new Set(), new Set()];

  const aTraiter = [];
  for (const { candidat, numCmd } of numCmdParCandidat) {
    const needDeco = !decoExistants.has(numCmd);
    const needConso = !consoExistants.has(numCmd);
    if (!needDeco && !needConso) {
      resume.dejaExistants += 1;
      continue;
    }
    aTraiter.push({ ...candidat, numCmd, needDeco, needConso });
  }

  if (!dryRun && aTraiter.length > 0) {
    logger.info(
      `syncGamesysExtraction: ${aTraiter.length} candidat(s) à traiter (${resume.dejaExistants} déjà à jour sur ${resume.candidats})`,
    );
    const bar = createBackfillProgressBar("syncGamesysExtraction", aTraiter.length);
    const limit = pLimit(concurrency);
    await Promise.all(
      aTraiter.map((candidat) =>
        limit(async () => {
          // Connexion dédiée par candidat (pas partagée entre les `concurrency` candidats en
          // parallèle) : une connexion ODBC ne supporte pas des requêtes concurrentes qui se
          // chevauchent — cf. decoGamesysStubSyncService.js, même contrainte reprise ici.
          const connection = await dbConfig.getDbConnection();
          try {
            let grouped;
            try {
              grouped = await dossierService.fetchDossierGroupedDetail(connection, candidat.cmd);
            } catch (err) {
              resume.erreurs += 1;
              logger.warn(`syncGamesysExtraction: échec numCmd=${candidat.numCmd} : ${err.message}`);
              return;
            }

            if (candidat.needDeco) {
              try {
                await creerStubsDeco(connection, candidat, grouped);
                resume.decoTraites += 1;
              } catch (err) {
                resume.decoErreurs += 1;
                logger.warn(`syncGamesysExtraction: stub Deco échoué numCmd=${candidat.numCmd} : ${err.message}`);
              }
            }

            if (candidat.needConso) {
              try {
                const result = await profilsKitsService.saveProfilsKitsFromGrouped(grouped, {
                  cmd: candidat.cmd,
                  client: candidat.client,
                  isPkOnly: false,
                  ville: "",
                });
                if (result === false) {
                  resume.consoErreurs += 1;
                } else {
                  resume.consoTraites += 1;
                }
              } catch (err) {
                resume.consoErreurs += 1;
                logger.warn(`syncGamesysExtraction: consommation échouée numCmd=${candidat.numCmd} : ${err.message}`);
              }
            }
          } finally {
            await closeConnection(connection);
            bar.increment(1, { ok: resume.decoTraites + resume.consoTraites, ko: resume.decoErreurs + resume.consoErreurs });
          }
        }),
      ),
    );
    bar.stop();
  }

  // Filet de sécurité : rattrape les refs présentes dans consommations_commandes mais jamais créées
  // dans stock_profiles (ex: upsert StockArticle ayant échoué silencieusement dans saveProfilsKits) —
  // conservé à l'identique de gamesysConsommationSyncService.js.
  const reconciliation = await stockArticleReconciliationService.reconcileStockArticlesFromConsommations({ dryRun });
  resume.orphelinsDetectes = reconciliation.orphelinsDetectes;
  resume.orphelinsReconcilies = reconciliation.crees;

  resume.erreurs += resume.decoErreurs + resume.consoErreurs;
  return resume;
}

// Crée un stub Deco gamesysStub:true par sous-dossier visuel résolu (ou un stub unique "métadonnées
// commande" en repli) — logique reprise à l'identique de decoGamesysStubSyncService.js, seule la
// source des données amont change (grouped déjà chargé au lieu de fetchSousDossiersVisuels +
// fetchDossierCommandeInfo/FormatPlaque/LivraisonDates séparés).
async function creerStubsDeco(connection, candidat, grouped) {
  const commandeInfo = dossierService.deriveCommandeInfoFromGrouped(grouped, candidat.client);

  // mag : grouped (ff_livraison) suffit dans la quasi-totalité des cas. Repli fc_references
  // (magasinRef/villeRef, hors grouped — non porté par buildDetail) seulement quand un stub est créé
  // AVANT que la ligne ff_livraison n'existe encore côté Gamesys (mag vide) — même repli que
  // decoGamesysStubSyncService.js, un seul aller-retour ODBC supplémentaire dans ce seul cas, jamais
  // pour ECOM (fc_references n'y résout rien).
  let mag = commandeInfo.mag;
  if (!mag && candidat.client !== "ECOM") {
    const { villeRef, magasinRef } = await dossierService.fetchDossierLivraisonDates(connection, candidat.cmd);
    mag = villeRef || magasinRef || undefined;
  }

  const commandeCommune = {
    client: candidat.client,
    date: new Date(),
    status: "A lancer",
    gamesysStub: true,
    dateCommande: commandeInfo.dateCommande ?? undefined,
    codeClient: commandeInfo.codeClient ?? undefined,
    refClient: commandeInfo.refClient ?? undefined,
    nombreProfil: commandeInfo.nombreProfil ?? undefined,
    nombreKitPose: commandeInfo.nombreKitPose ?? undefined,
    formatPlaqueGamesys: commandeInfo.formatPlaqueGamesys ?? undefined,
    // dibond = format plaque, même donnée Gamesys que formatPlaqueGamesys (dos_supp_1_ft, ex: "1260 x
    // 2600" en mm brut) — converti en cm sans espace ("126x260") via extractDimensionFormat pour
    // matcher la convention des dibond saisis manuellement, pas le format Gamesys brut.
    dibond: dossierService.extractDimensionFormat(commandeInfo.formatPlaqueGamesys) || undefined,
    mag: mag || undefined,
    prixTotal: commandeInfo.prixTotal ?? undefined,
    dateLivraisonSouhaitee: commandeInfo.dateLivraisonSouhaitee ?? undefined,
  };

  const sousDossiersVisuels = (grouped.sousDossiers || []).filter((s) => (s.visualReferences || []).length > 0);

  if (sousDossiersVisuels.length === 0) {
    // Aucun visuel résolu mais des profils/kits présents : la commande est en réalité 100%
    // accessoires (aucun panneau dibond), pas un visuel non résolu — pkOnly:true pour que ce stub
    // soit repris par les backfills dédiés pkOnly au lieu de rester étiqueté comme un job visuel vide.
    const pkOnly = (commandeInfo.nombreProfil ?? 0) > 0 || (commandeInfo.nombreKitPose ?? 0) > 0;
    // upsert idempotent (pas create()) : un autre chemin (saveDeco/saveProfilsKits) a pu créer le
    // document entre le scan initial et cet appel.
    await Deco.findOneAndUpdate(
      { numCmd: candidat.numCmd },
      { $setOnInsert: { numCmd: candidat.numCmd, ...commandeCommune, pkOnly } },
      { upsert: true },
    );
    return;
  }

  // Chaque sous-dossier est traité indépendamment (try/catch par itération, pas de throw global) :
  // un échec sur l'un d'eux (ex: resolveRefFields) ne doit pas empêcher la création des stubs des
  // AUTRES sous-dossiers de la même commande — même résilience que decoGamesysStubSyncService.js.
  let erreurs = 0;
  for (const sousDossier of sousDossiersVisuels) {
    try {
      const visuel = sousDossier.visualReferences[0];
      const refFields = (await Deco.resolveRefFields(candidat.client, visuel.reference)) || { matched: false };
      const finitionRepli =
        sousDossier.printFinish === "MAT" ? "Mat" : sousDossier.printFinish === "BRILLANT" ? "Brillant" : undefined;
      const isSurMesure = !!visuel.surMesure;
      const champsVisuel = refFields.matched
        ? { ref: visuel.reference, finition: refFields.finition, format: refFields.format, deco: refFields.deco }
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
    } catch (err) {
      erreurs += 1;
      logger.warn(
        `syncGamesysExtraction: stub échoué numCmd=${candidat.numCmd} sousDossier=${sousDossier.sousNumero} : ${err.message}`,
      );
    }
  }

  if (erreurs > 0 && erreurs === sousDossiersVisuels.length) {
    // Tous les sous-dossiers ont échoué : remonter une erreur pour que l'appelant le compte comme
    // tel (decoErreurs) plutôt qu'un succès silencieux.
    throw new Error(`${erreurs}/${sousDossiersVisuels.length} sous-dossiers en échec`);
  }
}

module.exports = { syncGamesysExtraction };
