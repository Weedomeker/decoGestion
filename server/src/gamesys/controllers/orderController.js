const { getDbConnection } = require("../config/db");

async function query(connection, sql, params = []) {
  const result = params?.length ? await connection.query(sql, params) : await connection.query(sql);

  return Array.from(result);
}

function sendError(res, status, code, message) {
  return res.status(status).json({ error: message, code });
}

async function closeConnection(connection) {
  if (connection) await connection.close();
}

exports.getOrderProductionDetails = async (req, res) => {
  let connection;

  try {
    const { commande } = req.params;

    if (!commande) {
      return sendError(res, 400, "ORDER_QUERY_REQUIRED", "Le numéro de commande est requis.");
    }

    connection = await getDbConnection();

    const dossiers = await query(
      connection,
      `
      select
        d.dos_seq,
        d.dos_no_cmde,
        d.dos_client,
        d.dos_date,
        e.endv_ndevis,
        e.endv_nvariant,
        e.endv_ref_client
      from public.fd_dossier d
      left join public.fd_entete_devi e on e.endv_seq = d.dos_seq
      where d.dos_no_cmde = ?
      `,
      [commande],
    );

    if (dossiers.length === 0) {
      return sendError(res, 404, "ORDER_NOT_FOUND", "Commande non trouvée.");
    }

    const results = [];

    for (const dossier of dossiers) {
      const seq = dossier.dos_seq;
      const dossierCommande = (dossier.dos_no_cmde || "").replace(/'/g, "''");

      const versions = await query(
        connection,
        `select dove_lib_v_1, dove_quant_v_1, dove_lib_v_2, dove_quant_v_2, dove_lib_v_3, dove_quant_v_3
         from public.fd_dossier_version
         where dove_seq = ?${dossierCommande ? ` or dove_no_cmde = '${dossierCommande}'` : ""}`,
        [seq],
      );

      const remarques = await query(
        connection,
        `select * from public.fd_dossier_remarques where dos_rem_seq = ?${dossierCommande ? ` or dos_rem_no_cmde = '${dossierCommande}'` : ""}`,
        [seq],
      );

      results.push({
        entete: dossier,
        versions,
        remarques,
      });
    }

    res.json(results);
  } catch (error) {
    sendError(res, 500, "ORDER_DETAIL_FAILED", error.message);
  } finally {
    await closeConnection(connection);
  }
};
