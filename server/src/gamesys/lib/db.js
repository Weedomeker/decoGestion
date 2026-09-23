const { getDbConnection } = require("../config/db");
const logger = require("../../logger/logger");

// connectionTimeout/loginTimeout (gamesys/config/db.js) ne bornent que l'établissement de la
// connexion (connect/login), jamais l'exécution d'une requête sur une connexion déjà ouverte. Si
// une connexion du pool devient silencieusement morte après une période d'inactivité (coupée par
// un firewall/NAT, cf. les délais de plusieurs minutes entre les étapes de démarrage du serveur —
// backfills, sync stubs, sync annulations, sync consommations), une requête dessus peut attendre
// indéfiniment une réponse qui ne viendra jamais (observé en conditions réelles le 23/09/2026 :
// syncConsommationsHistorique bloqué sans erreur ni log pendant 40+ minutes). node-odbc expose un
// vrai timeout natif par requête (SQL_ATTR_QUERY_TIMEOUT côté driver) via l'option `timeout` (en
// SECONDES, pas en ms) — contrairement à un timeout côté JS (Promise.race, testé et retiré, voir
// git blame), celui-ci fait réellement abandonner la requête au niveau du driver ODBC.
function queryTimeoutSeconds() {
  return parseInt(process.env.ODBC_QUERY_TIMEOUT, 10) || 15;
}

async function query(connection, sql, params = []) {
  try {
    const options = { timeout: queryTimeoutSeconds() };
    if (!params || params.length === 0) {
      const result = await connection.query(sql, options);
      return Array.from(result);
    }

    const result = await connection.query(sql, params, options);
    return Array.from(result);
  } catch (error) {
    logger.error(`Erreur requête SQL: ${error.message}`);
    throw error;
  }
}

function escapeSqlValue(value) {
  return String(value || "").replace(/'/g, "''");
}

function escapeSqlLike(value) {
  return String(value || "")
    .replace(/'/g, "''")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

function sqlTextList(values) {
  return values
    .filter(Boolean)
    .map((value) => `'${escapeSqlValue(value)}'`)
    .join(", ");
}

async function closeConnection(connection) {
  if (connection) await connection.close();
}

async function withDbConnection(callback) {
  const connection = await getDbConnection();
  try {
    return await callback(connection);
  } finally {
    await closeConnection(connection);
  }
}

module.exports = {
  query,
  escapeSqlValue,
  escapeSqlLike,
  sqlTextList,
  closeConnection,
  withDbConnection,
};
