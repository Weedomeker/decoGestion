const { expect } = require("chai");
const sinon = require("sinon");
const { fetchDossierPrixTotal } = require("../../server/src/gamesys/services/dossierService");

describe("dossierService.fetchDossierPrixTotal()", () => {
  it("retourne la somme des prix trouvés pour la commande racine", async () => {
    const connection = {
      query: sinon.stub().resolves([{ prix_total: "123.45" }]),
    };

    const result = await fetchDossierPrixTotal(connection, "100473");

    expect(result).to.equal(123.45);
    const [sql, params] = connection.query.firstCall.args;
    expect(sql).to.match(/fd_entete_devi/);
    expect(sql).to.match(/endv_no_dossier/);
    expect(sql).to.match(/endv_no_cmde_globale/);
    expect(params).to.deep.equal(["100473", "100473", "100473", "100473/%"]);
  });

  it("retourne null si aucune commande ne matche", async () => {
    const connection = { query: sinon.stub().resolves([{ prix_total: null }]) };

    const result = await fetchDossierPrixTotal(connection, "999999");

    expect(result).to.be.null;
  });

  it("retourne null si commande est vide, sans requêter", async () => {
    const connection = { query: sinon.stub() };

    const result = await fetchDossierPrixTotal(connection, "");

    expect(result).to.be.null;
    expect(connection.query.called).to.be.false;
  });

  it("accepte un numCmd numérique", async () => {
    const connection = {
      query: sinon.stub().resolves([{ prix_total: "50" }]),
    };

    const result = await fetchDossierPrixTotal(connection, 100504);

    expect(result).to.equal(50);
    const [, params] = connection.query.firstCall.args;
    expect(params).to.deep.equal(["100504", "100504", "100504", "100504/%"]);
  });

  it("préserve une somme de 0 (ne la traite pas comme absente)", async () => {
    const connection = { query: sinon.stub().resolves([{ prix_total: "0" }]) };

    const result = await fetchDossierPrixTotal(connection, "100473");

    expect(result).to.equal(0);
  });
});
