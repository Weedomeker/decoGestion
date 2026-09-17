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

describe("dossierService.buildVisualReferences() — sur-mesure", () => {
  it("enrichit une ligne SMES détectée par le libellé gabarit (signal B, sans stock)", () => {
    const enteteDevis = [
      {
        endv_identif: "Panneau déco sur-mesure 100x210 Finition Lisse",
        endv_ref_client: "BLANC ZERO 90 x 210 MAT",
        endv_px_total: 185.08,
        endv_quant: 1,
      },
    ];

    const [r] = require("../../server/src/gamesys/services/dossierService")
      .buildVisualReferences(enteteDevis, [], "");

    expect(r.surMesure).to.equal(true);
    expect(r.surMesureKind).to.equal("teinte_masse");
    expect(r.deco).to.equal("BLANC ZERO");
    expect(r.finition).to.equal("LISSE");
    expect(r.format).to.equal("100x210");
    expect(r.printFormat).to.equal("90x210");
    expect(r.reference).to.equal("BLANC ZERO 90 x 210 MAT"); // INCHANGÉ
  });

  it("classe 'visuel' un vrai visuel sur-mesure et porte l'orientation", () => {
    const enteteDevis = [
      {
        endv_identif: "Panneau déco sur-mesure 125x210 Finition Texturée",
        endv_ref_client: "ARCHE BEIGE CENTRE 86.9 X 201.5 MAT",
        endv_px_total: 199,
        endv_quant: 1,
      },
    ];
    const [r] = require("../../server/src/gamesys/services/dossierService")
      .buildVisualReferences(enteteDevis, [], "");
    expect(r.surMesureKind).to.equal("visuel");
    expect(r.deco).to.equal("ARCHE BEIGE");
    expect(r.orientation).to.equal("CENTRE");
    expect(r.finition).to.equal("TEXTUREE");
    expect(r.format).to.equal("125x210");
    expect(r.printFormat).to.equal("86.9x201.5");
  });

  it("détecte via st_art_sfamille='SMES' même si le libellé est 'Format fini : ...' (signal A)", () => {
    const enteteDevis = [
      { endv_identif: "Format fini : 100.0 x 255.0 cm", endv_ref_client: "BAMBUSA DROITE 80 X 230 MAT", endv_px_total: 229.39, endv_quant: 1 },
    ];
    const stock = [
      { reference: "MU-SM100X255T", modele: "MU-SM100X255T", libelle: "Panneau déco sur-mesure 100x255 Finition Texturée", codeTarif: "MU-SM100X255T", sousFamille: "SMES", type: "PANO" },
    ];
    const [r] = require("../../server/src/gamesys/services/dossierService")
      .buildVisualReferences(enteteDevis, stock, "");
    expect(r.surMesure).to.equal(true);
    expect(r.deco).to.equal("BAMBUSA");
    expect(r.orientation).to.equal("DROIT");
    expect(r.finition).to.equal("TEXTUREE"); // via suffixe code tarif 'T'
  });

  it("ne touche pas une ligne catalogue standard", () => {
    const enteteDevis = [{ endv_identif: "VISUEL MOSAIQUE", endv_px_total: 243.69, endv_ref_client: "" }];
    const [r] = require("../../server/src/gamesys/services/dossierService")
      .buildVisualReferences(enteteDevis, [], "");
    expect(r.surMesure).to.equal(undefined);
  });
});
