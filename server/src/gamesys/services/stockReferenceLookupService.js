const { getDbConnection } = require("../config/db");
const { query, closeConnection } = require("../lib/db");

const CHUNK_SIZE = 200;

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Recherche dans public.fs_stock les lignes correspondant aux références fournies,
 * en testant à la fois st_art_ref_client et st_art_gencod (les deux conventions
 * observées selon l'enseigne — cf. server/src/services/referencesCheckService.js
 * pour le pendant côté extraction de noms de fichiers disque).
 *
 * Retourne une Map indexée par référence (trim) — sur les deux champs — vers la
 * ligne fs_stock correspondante, pour que la recherche d'une ref MongoDB
 * fonctionne quel que soit le champ Gamesys réellement utilisé.
 */
async function findStockByRefs(refs) {
  const cleanRefs = [...new Set((refs || []).map((ref) => String(ref || "").trim()).filter(Boolean))];
  const matches = new Map();
  if (cleanRefs.length === 0) return matches;

  for (const batch of chunk(cleanRefs, CHUNK_SIZE)) {
    const placeholders = batch.map(() => "?").join(", ");
    const connection = await getDbConnection();
    try {
      const rows = await query(
        connection,
        `
          select st_art_ref_client, st_art_gencod, st_modele, st_lib_1_conso, st_lib_2_conso
          from public.fs_stock
          where st_art_ref_client in (${placeholders}) or st_art_gencod in (${placeholders})
        `,
        [...batch, ...batch]
      );

      for (const row of rows) {
        const refClient = String(row.st_art_ref_client || "").trim();
        const gencod = String(row.st_art_gencod || "").trim();
        if (refClient) matches.set(refClient, row);
        if (gencod) matches.set(gencod, row);
      }
    } finally {
      await closeConnection(connection);
    }
  }

  return matches;
}

/**
 * Charge en une passe l'index libellé fs_stock -> { famille, tarif }, utilisé par
 * server/src/gamesys/utils/clientCatalogue.js pour rattacher à ECOM les commandes des comptes
 * sans préfixe enseigne. fs_stock ≈ 2 600 libellés distincts -> une seule requête, en mémoire
 * (idiome "une passe, pas N" — cf. feedback_odbc_backfill_resource_limits).
 *
 * Premier gagnant en cas de libellé dupliqué : st_lib_1_conso n'est pas 1:1 avec la famille,
 * mais le départage est sans incidence sur le verdict (DECO LM et DECO ECO sont tous deux dans
 * FAM_DECO côté clientCatalogue, qui force ECOM de toute façon).
 *
 * @param {object} [connection] connexion ODBC à réutiliser ; si absente, une connexion dédiée
 *   est ouverte puis fermée.
 * @returns {Promise<Map<string, { famille: string, tarif: string }>>} clé = UPPER(st_lib_1_conso)
 */
async function loadFamilleByLabel(connection) {
  const own = !connection;
  const conn = connection || (await getDbConnection());
  try {
    const rows = await query(
      conn,
      `
        select st_lib_1_conso, st_art_famille, st_code_tarif
        from public.fs_stock
        where st_lib_1_conso is not null and st_lib_1_conso <> ''
      `
    );

    const map = new Map();
    for (const row of rows) {
      const key = String(row.st_lib_1_conso).toUpperCase();
      if (map.has(key)) continue;
      map.set(key, {
        famille: String(row.st_art_famille || "").trim(),
        tarif: String(row.st_code_tarif || "").trim(),
      });
    }
    return map;
  } finally {
    if (own) await closeConnection(conn);
  }
}

module.exports = { findStockByRefs, loadFamilleByLabel };
