const { expect } = require("chai");
const { buildVisualReferences } = require("../../server/src/gamesys/services/dossierService");

describe("dossierService.buildVisualReferences()", () => {
  it("porte endv_px_total de la ligne fd_entete_devi source sur l'entrée visualReferences correspondante", () => {
    const enteteDevis = [
      { endv_identif: "VISUEL MOSAIQUE", endv_px_total: 243.69, endv_ref_client: "" },
    ];

    const result = buildVisualReferences(enteteDevis, [], "");

    expect(result).to.have.length(1);
    expect(result[0].endv_px_total).to.equal(243.69);
  });

  it("porte un endv_px_total distinct par ligne quand plusieurs visuels partagent le même endv_identif générique (cas réel cmd 167500, BAMBUSA)", () => {
    const enteteDevis = [
      {
        endv_identif: " Format fini : 100.0 x 255.0 cm ",
        endv_px_total: 229.39,
        endv_ref_client: "BAMBUSA DROITE 80 X 230 MAT",
      },
      {
        endv_identif: " Format fini : 100.0 x 255.0 cm ",
        endv_px_total: 258.12,
        endv_ref_client: "BAMBUSA GAUCHE 100 X 230 MAT",
      },
    ];

    const result = buildVisualReferences(enteteDevis, [], "");

    expect(result).to.have.length(2);
    const droite = result.find((r) => r.reference === "BAMBUSA DROITE 80 X 230 MAT");
    const gauche = result.find((r) => r.reference === "BAMBUSA GAUCHE 100 X 230 MAT");
    expect(droite.endv_px_total).to.equal(229.39);
    expect(gauche.endv_px_total).to.equal(258.12);
  });

  it("exclut les lignes profil/kit", () => {
    const enteteDevis = [
      { endv_identif: "PROFILE DE FINITION ALU MAT 255cm", endv_px_total: 50.3, endv_ref_client: "" },
      { endv_identif: "Kit de pose pour 1 panneau", endv_px_total: 33.06, endv_ref_client: "" },
    ];

    const result = buildVisualReferences(enteteDevis, [], "");

    expect(result).to.have.length(0);
  });
});
