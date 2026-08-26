const { expect } = require("chai");
const { groupCandidatesFromRows } = require("../../server/src/gamesys/services/dossierService");

describe("dossierService.groupCandidatesFromRows()", () => {
  it("garde uniquement les lignes profil/kit de pose, en ignorant les visuels", () => {
    const rows = [
      { dos_no_cmde: "164629/00", dos_client: "LM01", endv_identif: "PROFIL BLANC 255" },
      { dos_no_cmde: "164629/00", dos_client: "LM01", endv_identif: "VISUEL MOSAIQUE" },
      { dos_no_cmde: "164630/00", dos_client: "CAS02", endv_identif: "KIT DE POSE" },
    ];

    const result = groupCandidatesFromRows(rows);

    expect(result).to.deep.equal([
      { cmd: "164629", client: "LM" },
      { cmd: "164630", client: "CASTO" },
    ]);
  });

  it("regroupe les sous-dossiers d'une même commande racine en un seul candidat", () => {
    const rows = [
      { dos_no_cmde: "164629/00", dos_client: "BM01", endv_identif: "PROFIL ALU" },
      { dos_no_cmde: "164629/01", dos_client: "BM01", endv_identif: "KIT DE POSE" },
    ];

    const result = groupCandidatesFromRows(rows);

    expect(result).to.deep.equal([{ cmd: "164629", client: "BRICO" }]);
  });

  it("ignore les lignes sans dos_no_cmde", () => {
    const rows = [{ dos_no_cmde: null, dos_client: "LM01", endv_identif: "PROFIL BLANC" }];

    expect(groupCandidatesFromRows(rows)).to.deep.equal([]);
  });

  it("classe en PRO les codes client qui ne matchent aucun préfixe enseigne connu", () => {
    const rows = [{ dos_no_cmde: "164631/00", dos_client: "I96", endv_identif: "PROFIL BLANC" }];

    expect(groupCandidatesFromRows(rows)).to.deep.equal([{ cmd: "164631", client: "PRO" }]);
  });

  it("retourne un tableau vide quand aucune ligne ne correspond à un profil/kit", () => {
    const rows = [{ dos_no_cmde: "164632/00", dos_client: "ECOM01", endv_identif: "VISUEL TERRAZZO" }];

    expect(groupCandidatesFromRows(rows)).to.deep.equal([]);
  });

  it("gère un tableau vide ou undefined", () => {
    expect(groupCandidatesFromRows([])).to.deep.equal([]);
    expect(groupCandidatesFromRows(undefined)).to.deep.equal([]);
  });
});
