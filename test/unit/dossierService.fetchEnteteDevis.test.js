const { expect } = require("chai");
const sinon = require("sinon");
const { fetchEnteteDevis } = require("../../server/src/gamesys/services/dossierService");

describe("dossierService.fetchEnteteDevis()", () => {
  it("retrouve l'entête par endv_seq même quand endv_no_commande/endv_no_dossier ont divergé de dos_no_cmde", async () => {
    // Cas réel observé : dossier 100687/00 renuméroté côté Gamesys, son entête (endv_seq=6689)
    // porte endv_no_commande="102208/02" et endv_no_dossier="102208" — aucun critère textuel
    // ne matche plus "100687/00", seul endv_seq = dos_seq (6689) le relie encore.
    const enteteRow = {
      endv_seq: 6689,
      endv_identif: "PROFILE DE FINITION NOIR MAT 255cm",
      endv_no_dossier: "102208",
      endv_no_commande: "102208/02",
      endv_coduniq: "7127v0",
    };
    const connection = {
      query: sinon.stub().resolves([enteteRow]),
    };

    const result = await fetchEnteteDevis(connection, "100687/00", "differentCode", 6689);

    expect(connection.query.calledOnce).to.be.true;
    const [, params] = connection.query.firstCall.args;
    expect(params).to.include(6689);
    expect(result).to.deep.equal([enteteRow]);
  });

  it("dédoublonne par endv_seq quand un match textuel et le match par seq retournent la même ligne", async () => {
    const enteteRow = { endv_seq: 42, endv_identif: "KIT DE POSE" };
    const connection = {
      query: sinon.stub().resolves([enteteRow, enteteRow]),
    };

    const result = await fetchEnteteDevis(connection, "164629/00", "code", 42);

    expect(result).to.have.length(1);
    expect(result[0]).to.deep.equal(enteteRow);
  });

  it("retourne un tableau vide et logue un warning si la requête échoue", async () => {
    const connection = {
      query: sinon.stub().rejects(new Error("ODBC down")),
    };

    const result = await fetchEnteteDevis(connection, "164629/00", "code", 1);

    expect(result).to.deep.equal([]);
  });
});
