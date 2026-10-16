const { expect } = require("chai");
const sinon = require("sinon");

const { query } = require("../../server/src/gamesys/lib/db");

describe("gamesys/lib/db.js — query()", () => {
  afterEach(() => {
    sinon.restore();
    delete process.env.ODBC_QUERY_TIMEOUT;
  });

  it("passe un timeout natif ODBC à connection.query même sans paramètres de binding", async () => {
    const connection = { query: sinon.stub().resolves([]) };

    await query(connection, "select 1");

    expect(connection.query.calledOnce).to.be.true;
    const [sql, options] = connection.query.firstCall.args;
    expect(sql).to.equal("select 1");
    expect(options).to.deep.equal({ timeout: 15 });
  });

  it("passe un timeout natif ODBC à connection.query avec des paramètres de binding", async () => {
    const connection = { query: sinon.stub().resolves([]) };

    await query(connection, "select * from t where id = ?", [42]);

    expect(connection.query.calledOnce).to.be.true;
    const [sql, params, options] = connection.query.firstCall.args;
    expect(sql).to.equal("select * from t where id = ?");
    expect(params).to.deep.equal([42]);
    expect(options).to.deep.equal({ timeout: 15 });
  });

  it("le timeout est configurable via ODBC_QUERY_TIMEOUT (en secondes)", async () => {
    process.env.ODBC_QUERY_TIMEOUT = "30";
    const connection = { query: sinon.stub().resolves([]) };

    await query(connection, "select 1");

    const [, options] = connection.query.firstCall.args;
    expect(options).to.deep.equal({ timeout: 30 });
  });

  it("journalise la cause du driver (odbcErrors) et un extrait de la requête, puis relance l'erreur", async () => {
    const logger = require("../../server/src/logger/logger");
    const logError = sinon.stub(logger, "error");
    const odbcError = new Error("[odbc] Error executing the sql statement");
    odbcError.odbcErrors = [{ state: "42S02", code: -141, message: "Table fd_ent_cmde introuvable" }];
    const connection = { query: sinon.stub().rejects(odbcError) };

    let thrown;
    try {
      await query(connection, "select *\n  from fd_ent_cmde where id = ?", [1]);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).to.equal(odbcError);
    const message = logError.firstCall.args[0];
    expect(message).to.include("driver: 42S02 -141 Table fd_ent_cmde introuvable");
    expect(message).to.include("SQL: select * from fd_ent_cmde where id = ?");
  });
});
