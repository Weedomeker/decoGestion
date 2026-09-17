const { expect } = require("chai");
const sinon = require("sinon");
const { fetchDossierFormatPlaque } = require("../../server/src/gamesys/services/dossierService");

describe("dossierService.fetchDossierFormatPlaque()", () => {
  it("prend la 1ère ligne dont dos_supp_1_ft est non vide (les lignes profil/kit l'ont vide)", async () => {
    const connection = {
      query: sinon.stub().resolves([
        { dos_supp_1_ft: "" },
        { dos_supp_1_ft: "1510 x 2600" },
        { dos_supp_1_ft: "1510 x 2600" },
      ]),
    };

    const result = await fetchDossierFormatPlaque(connection, "167648");

    expect(result).to.equal("1510 x 2600");
    const [sql, params] = connection.query.firstCall.args;
    expect(sql).to.match(/fd_dossier/);
    expect(sql).to.match(/dos_supp_1_ft/);
    expect(params).to.deep.equal(["167648", "167648/%"]);
  });

  it("retourne null si toutes les lignes ont dos_supp_1_ft vide", async () => {
    const connection = { query: sinon.stub().resolves([{ dos_supp_1_ft: "" }, { dos_supp_1_ft: null }]) };

    const result = await fetchDossierFormatPlaque(connection, "167648");

    expect(result).to.be.null;
  });

  it("retourne null si aucune ligne ne matche", async () => {
    const connection = { query: sinon.stub().resolves([]) };

    const result = await fetchDossierFormatPlaque(connection, "999999");

    expect(result).to.be.null;
  });

  it("retourne null si commande est vide, sans requêter", async () => {
    const connection = { query: sinon.stub() };

    const result = await fetchDossierFormatPlaque(connection, "");

    expect(result).to.be.null;
    expect(connection.query.called).to.be.false;
  });
});
