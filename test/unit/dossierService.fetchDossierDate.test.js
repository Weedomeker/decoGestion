const { expect } = require("chai");
const sinon = require("sinon");
const { fetchDossierDate } = require("../../server/src/gamesys/services/dossierService");

describe("dossierService.fetchDossierDate()", () => {
  it("retourne la date la plus ancienne trouvée pour la commande racine", async () => {
    const connection = { query: sinon.stub().resolves([{ dos_date: "2024-12-04" }]) };

    const result = await fetchDossierDate(connection, "100473");

    expect(result).to.be.instanceOf(Date);
    expect(result.toISOString().slice(0, 10)).to.equal("2024-12-04");
    const [sql, params] = connection.query.firstCall.args;
    expect(sql).to.match(/dos_no_cmde/);
    expect(params).to.deep.equal(["100473", "100473/%"]);
  });

  it("retourne null si aucune commande ne matche", async () => {
    const connection = { query: sinon.stub().resolves([{ dos_date: null }]) };

    const result = await fetchDossierDate(connection, "999999");

    expect(result).to.be.null;
  });

  it("retourne null si commande est vide, sans requêter", async () => {
    const connection = { query: sinon.stub() };

    const result = await fetchDossierDate(connection, "");

    expect(result).to.be.null;
    expect(connection.query.called).to.be.false;
  });

  it("accepte un numCmd numérique", async () => {
    const connection = { query: sinon.stub().resolves([{ dos_date: "2025-02-19" }]) };

    const result = await fetchDossierDate(connection, 100504);

    expect(result.toISOString().slice(0, 10)).to.equal("2025-02-19");
    const [, params] = connection.query.firstCall.args;
    expect(params).to.deep.equal(["100504", "100504/%"]);
  });
});
