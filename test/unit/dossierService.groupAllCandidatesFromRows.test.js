const { expect } = require("chai");
const { groupAllCandidatesFromRows } = require("../../server/src/gamesys/services/dossierService");

describe("dossierService.groupAllCandidatesFromRows()", () => {
  it("garde toutes les lignes, y compris les visuels (contrairement à groupCandidatesFromRows)", () => {
    const rows = [
      { dos_no_cmde: "164629/00", dos_client: "LM01", endv_identif: "VISUEL MOSAIQUE" },
      { dos_no_cmde: "164630/00", dos_client: "CAS02", endv_identif: "KIT DE POSE" },
    ];

    const result = groupAllCandidatesFromRows(rows);

    expect(result).to.deep.equal([
      { cmd: "164629", client: "LM" },
      { cmd: "164630", client: "CASTO" },
    ]);
  });

  it("regroupe les sous-dossiers d'une même commande racine en un seul candidat", () => {
    const rows = [
      { dos_no_cmde: "164629/00", dos_client: "BM01" },
      { dos_no_cmde: "164629/01", dos_client: "BM01" },
    ];

    expect(groupAllCandidatesFromRows(rows)).to.deep.equal([{ cmd: "164629", client: "BRICO" }]);
  });

  it("ignore les lignes sans dos_no_cmde ou avec un dos_client non reconnu", () => {
    const rows = [
      { dos_no_cmde: null, dos_client: "LM01" },
      { dos_no_cmde: "164631/00", dos_client: "XYZ" },
    ];

    expect(groupAllCandidatesFromRows(rows)).to.deep.equal([]);
  });

  it("gère un tableau vide ou undefined", () => {
    expect(groupAllCandidatesFromRows([])).to.deep.equal([]);
    expect(groupAllCandidatesFromRows(undefined)).to.deep.equal([]);
  });
});
