/**
 * Compare les références MongoDB d'un client à leurs correspondances Gamesys
 * (cf. server/src/gamesys/services/stockReferenceLookupService.js pour la
 * récupération des lignes fs_stock).
 *
 * La référence MongoDB fait foi : on vérifie uniquement qu'elle existe bien
 * côté Gamesys. Les libellés (`model` vs `st_modele`/libellés stock) peuvent
 * légitimement différer entre les deux systèmes — ce n'est pas une erreur à
 * signaler, donc aucune comparaison n'est faite sur ce champ.
 *
 * `dbRefs`       : [{ ref, model, format }] — issus de Model.find(...) côté MongoDB
 * `stockMatches` : Map<ref, fs_stock row> — voir findStockByRefs()
 */
function compareClientReferencesWithGamesys(dbRefs, stockMatches, client) {
  const notFoundInGamesys = [];

  for (const dbRef of dbRefs) {
    const ref = String(dbRef.ref || "").trim();
    const stockRow = ref ? stockMatches.get(ref) : null;

    if (!stockRow) {
      notFoundInGamesys.push({ ref: dbRef.ref, model: dbRef.model, client });
    }
  }

  return {
    notFoundInGamesys,
    stats: {
      refsInDb: dbRefs.length,
      notFoundCount: notFoundInGamesys.length,
    },
  };
}

module.exports = { compareClientReferencesWithGamesys };
