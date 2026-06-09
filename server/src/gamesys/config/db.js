require("dotenv").config();
const odbc = require("odbc");

async function getDbConnection() {
  if (process.env.ODBC_CONNECTION_STRING) {
    return odbc.connect(process.env.ODBC_CONNECTION_STRING);
  }

  if (process.env.ODBC_DSN) {
    const connStr = [
      `DSN=${process.env.ODBC_DSN}`,
      `UID=${process.env.DB_USER || ""}`,
      `PWD=${process.env.DB_PASSWORD || ""}`,
    ].join(";");
    return odbc.connect(connStr);
  }

  const connStr = [
    `Driver={${process.env.ODBC_DRIVER || "PostgreSQL Unicode(x64)"}}`,
    `Server=${process.env.DB_HOST || "localhost"}`,
    `Port=${process.env.DB_PORT || "5432"}`,
    `Database=${process.env.DB_NAME || "postgres"}`,
    `Uid=${process.env.DB_USER || "postgres"}`,
    `Pwd=${process.env.DB_PASSWORD || ""}`,
  ].join(";");
  return odbc.connect(connStr);
}

module.exports = { getDbConnection };
