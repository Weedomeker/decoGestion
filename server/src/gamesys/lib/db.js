const { getDbConnection } = require("../config/db");
const logger = require("../../logger/logger");

async function query(connection, sql, params = []) {
  try {
    if (!params || params.length === 0) {
      const result = await connection.query(sql);
      return Array.from(result);
    }

    const result = await connection.query(sql, params);
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
