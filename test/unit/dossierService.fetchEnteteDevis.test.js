const { expect } = require("chai");
const sinon = require("sinon");
const { fetchEnteteDevis } = require("../../server/src/gamesys/services/dossierService");

describe("dossierService.fetchEnteteDevis()", () => {
  it("ne relie pas l'entête par endv_seq = dos_seq (deux numérotations indépendantes)", async () => {
    // Cas réel 163137/01 (dos_seq=24302) : sa ligne devis est endv_seq=8799 (reliée par
    // endv_no_commande/endv_coduniq), mais endv_seq=24302 est la ligne "CHAUX BEIGE" de la
    // commande 167846/03 — le critère seq rattachait ce visuel étranger au sous-dossier profilé.
    // Mesuré : 97,5 % des collisions seq pointent vers une autre commande, 0 dossier n'en dépend.
    const connection = { query: sinon.stub().resolves([]) };

    await fetchEnteteDevis(connection, "163137/01", "9206v0");

    const [sql, params] = connection.query.firstCall.args;
    expect(sql).to.not.match(/endv_seq\s*=/);
    expect(params).to.deep.equal(["163137/01", "163137/01", "163137/01", "163137/01", "9206v0"]);
  });

  it("dédoublonne par endv_seq quand plusieurs critères textuels retournent la même ligne", async () => {
    const enteteRow = { endv_seq: 42, endv_identif: "KIT DE POSE" };
    const connection = {
      query: sinon.stub().resolves([enteteRow, enteteRow]),
    };

    const result = await fetchEnteteDevis(connection, "164629/00", "code");

    expect(result).to.have.length(1);
    expect(result[0]).to.deep.equal(enteteRow);
  });

  it("retourne un tableau vide et logue un warning si la requête échoue", async () => {
    const connection = {
      query: sinon.stub().rejects(new Error("ODBC down")),
    };

    const result = await fetchEnteteDevis(connection, "164629/00", "code");

    expect(result).to.deep.equal([]);
  });
});
