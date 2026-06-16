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

module.exports = { findStockByRefs };
