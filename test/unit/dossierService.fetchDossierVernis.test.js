const { expect } = require("chai");
const sinon = require("sinon");
const { fetchDossierVernis } = require("../../server/src/gamesys/services/dossierService");

describe("dossierService.fetchDossierVernis()", () => {
  it("retourne 'Mat' pour un vernis Mat sur le sous-dossier précis, sans requête de repli", async () => {
    const connection = {
      query: sinon.stub().resolves([{ dos_imp_1_fac_p_1: "pelli. Ro  (Vernis Mat) sur VERNI/" }]),
    };

    const result = await fetchDossierVernis(connection, "167431", "03");

    expect(result).to.equal("Mat");
    expect(connection.query.callCount).to.equal(1);
    const [sql, params] = connection.query.firstCall.args;
    expect(sql).to.match(/dos_no_cmde = \?/);
    expect(params).to.deep.equal(["167431/03"]);
  });

  it("retourne 'Brillant' via la requête de repli quand le sous-dossier précis ne porte pas de vernis", async () => {
    const connection = { query: sinon.stub() };
    connection.query.onFirstCall().resolves([{ dos_imp_1_fac_p_1: "" }]);
    connection.query.onSecondCall().resolves([{ dos_imp_1_fac_p_1: "pelli. Ro  (Vernis Brillant) sur VERNI/" }]);

    const result = await fetchDossierVernis(connection, "167845", "01");

    expect(result).to.equal("Brillant");
    expect(connection.query.callCount).to.equal(2);
    expect(connection.query.secondCall.args[0]).to.match(/LIKE \? ESCAPE/);
  });

  it("interroge directement la commande racine quand aucun sousDossier n'est fourni", async () => {
    const connection = {
      query: sinon.stub().resolves([{ dos_imp_1_fac_p_1: "pelli. Ro  (Vernis Brillant) sur VERNI/" }]),
    };

    const result = await fetchDossierVernis(connection, "167722");

    expect(result).to.equal("Brillant");
    expect(connection.query.callCount).to.equal(1);
    expect(connection.query.firstCall.args[0]).to.match(/LIKE \? ESCAPE/);
  });

  it("retourne null quand aucun sous-dossier ne porte de vernis exploitable", async () => {
    const connection = { query: sinon.stub().resolves([{ dos_imp_1_fac_p_1: "" }, { dos_imp_1_fac_p_1: null }]) };

    const result = await fetchDossierVernis(connection, "999999", "00");

    expect(result).to.be.null;
  });

  it("retourne null sans requêter quand la commande est vide", async () => {
    const connection = { query: sinon.stub() };

    const result = await fetchDossierVernis(connection, "");

    expect(result).to.be.null;
    expect(connection.query.called).to.be.false;
  });
});
