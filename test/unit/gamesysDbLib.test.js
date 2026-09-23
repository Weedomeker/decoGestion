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
});
