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

  it("exclut les comptes internes magasin LM###M (PLV/signalétique showroom, pas de la déco)", () => {
    const rows = [
      { dos_no_cmde: "168360/00", dos_client: "LM047M", endv_identif: "Moulures\rLot 16 séparateurs moulures" },
      { dos_no_cmde: "168360/07", dos_client: "LM047M", endv_identif: "ILV gamme verrière ILV SHOWROOM INTERIEUR\r11 PLV" },
      { dos_no_cmde: "167843/00", dos_client: "lm030m", endv_identif: "PROFILE DE FINITION OR MAT 255cm" },
    ];

    expect(groupAllCandidatesFromRows(rows)).to.deep.equal([]);
  });

  it("garde les comptes magasin LM classiques (LM047, LM101)", () => {
    const rows = [
      { dos_no_cmde: "168361/00", dos_client: "LM047", endv_identif: "ONYX GAUCHE 125x210cm" },
      { dos_no_cmde: "168362/00", dos_client: "LM101", endv_identif: "BLANC ZÉRO 125x210cm" },
    ];

    expect(groupAllCandidatesFromRows(rows)).to.deep.equal([
      { cmd: "168361", client: "LM" },
      { cmd: "168362", client: "LM" },
    ]);
  });

  it("gère un tableau vide ou undefined", () => {
    expect(groupAllCandidatesFromRows([])).to.deep.equal([]);
    expect(groupAllCandidatesFromRows(undefined)).to.deep.equal([]);
  });
});
