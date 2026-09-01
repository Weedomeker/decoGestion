const logger = require("../logger/logger");
// Import via objet module (pas destructuré) pour permettre le stub en test, comme
// consommationPrixBackfillService.js / startupPrixBackfillService.js.
const dossierService = require("../gamesys/services/dossierService");
const dbConfig = require("../gamesys/config/db");
const { closeConnection } = require("../gamesys/lib/db");

// POC : charge en UNE requête ensembliste (dossierService.fetchSyntheseCommandes) la synthèse par
// commande de toute une fenêtre temporelle, et renvoie une Map `numCmd -> synthèse` que les
// backfills de démarrage consomment en mémoire au lieu de refaire fetchDossierCommandeInfo /
// fetchDossierLivraisonDates / getDossierDetail commande par commande.
//
// Usage visé dans startupPrixBackfillService.backfillRecentDecoData :
//   const synthese = await chargerSyntheseCommandes({ sinceDate });
//   // puis, pour chaque document Deco/ConsommationCommande à compléter :
//   const s = synthese.get(doc.numCmd);
//   if (s) { doc.prixTotal ??= s.prixTotal; doc.dateLivraisonSouhaitee ??= s.dateLivraisonSouhaitee; ... }
//
// - `sinceDate` (Date | 'YYYY-MM-DD') obligatoire.
// - `clients` : filtre applicatif optionnel (['LM','CASTO',...]) ; sinon toutes enseignes mappables.
// - `seulementLivrables` : true => n'inclut que les commandes ent_statut_livraison >= 2 (à laisser
//   false pour la création de stubs, qui vise les commandes trop fraîches pour ff_livraison).
// - `connection` : connexion ODBC injectée à réutiliser ; sinon une connexion dédiée est ouverte
//   puis fermée ici.
async function chargerSyntheseCommandes({
  sinceDate,
  clients,
  seulementLivrables = false,
  resoudreClientsViaCatalogue = false,
  connection,
} = {}) {
  const conn = connection || (await dbConfig.getDbConnection());
  let lignes;
  try {
    lignes = await dossierService.fetchSyntheseCommandes(conn, { sinceDate, seulementLivrables });
  } finally {
    if (!connection) await closeConnection(conn);
  }

  // La requête ensembliste résout le client via le préfixe du code compte (mapDosClientToAppClient).
  // Les comptes e-commerce non préfixés y ressortent avec client=null : on récupère alors leur
  // enseigne via listCommandesRecentes (qui gère sa propre connexion + la passe catalogue).
  let clientParNumCmd = null;
  if (resoudreClientsViaCatalogue) {
    try {
      const recentes = await dossierService.listCommandesRecentes({ sinceDate });
      clientParNumCmd = new Map();
      for (const c of recentes) {
        const n = parseInt(c.cmd, 10);
        if (n && !Number.isNaN(n) && c.client) clientParNumCmd.set(n, c.client);
      }
    } catch (err) {
      logger.warn(
        `chargerSyntheseCommandes: résolution client via catalogue échouée : ${err.message}`,
      );
    }
  }

  const filtreClients = Array.isArray(clients) && clients.length ? new Set(clients) : null;
  const parNumCmd = new Map();
  let ignorees = 0;
  let horsFiltre = 0;

  for (const ligne of lignes) {
    if (!ligne.client && clientParNumCmd) {
      const recupere = clientParNumCmd.get(ligne.numCmd);
      if (recupere) ligne.client = recupere;
    }
    if (!ligne.numCmd || Number.isNaN(ligne.numCmd) || !ligne.client) {
      ignorees += 1;
      continue;
    }
    if (filtreClients && !filtreClients.has(ligne.client)) {
      horsFiltre += 1;
      continue;
    }
    // Une même offre Gamesys peut produire plusieurs lignes SQL (sous-dossiers non totalement
    // amalgamés par le GROUP BY) : on garde la 1ère rencontrée — l'ORDER BY date_commande DESC de
    // la requête met la plus récente en tête.
    if (!parNumCmd.has(ligne.numCmd)) parNumCmd.set(ligne.numCmd, ligne);
  }

  const multiRoot = [...parNumCmd.values()].filter((s) => s.multiRoot).length;
  logger.info(
    `chargerSyntheseCommandes: ${parNumCmd.size} commandes retenues ` +
      `(${lignes.length} lignes SQL, ${ignorees} ignorées, ${horsFiltre} hors filtre clients, ` +
      `${multiRoot} multi-dossiers).`,
  );
  return parNumCmd;
}

module.exports = { chargerSyntheseCommandes };
