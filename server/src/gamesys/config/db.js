require("dotenv").config();
const odbc = require("odbc");

const CONNECTION_TIMEOUT = parseInt(process.env.ODBC_CONNECT_TIMEOUT || "10", 10);
const LOGIN_TIMEOUT = parseInt(process.env.ODBC_LOGIN_TIMEOUT || "10", 10);
const POOL_SIZE = parseInt(process.env.ODBC_POOL_SIZE || "10", 10);

function buildConnectionString() {
  if (process.env.ODBC_CONNECTION_STRING) {
    return process.env.ODBC_CONNECTION_STRING;
  }
  if (process.env.ODBC_DSN) {
    return [
      `DSN=${process.env.ODBC_DSN}`,
      `UID=${process.env.DB_USER || ""}`,
      `PWD=${process.env.DB_PASSWORD || ""}`,
    ].join(";");
  }
  return [
    `Driver={${process.env.ODBC_DRIVER || "PostgreSQL Unicode(x64)"}}`,
    `Servername=${process.env.DB_HOST || "localhost"}`,
    `Port=${process.env.DB_PORT || "5432"}`,
    `Database=${process.env.DB_DATABASE || process.env.DB_NAME || "postgres"}`,
    `UID=${process.env.DB_USER || "postgres"}`,
    `Password=${process.env.DB_PASSWORD || ""}`,
  ].join(";");
}

let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    poolPromise = odbc.pool({
      connectionString: buildConnectionString(),
      connectionTimeout: CONNECTION_TIMEOUT,
      loginTimeout: LOGIN_TIMEOUT,
      initialSize: 2,
      incrementSize: 2,
      maxSize: POOL_SIZE,
    });
  }
  return poolPromise;
}

async function getDbConnection() {
  const pool = await getPool();
  return pool.connect();
}

module.exports = { getDbConnection };
