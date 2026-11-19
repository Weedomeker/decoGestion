const { expect } = require("chai");
const { donneesEtiquette, remplacerJetons } = require("../../../server/src/stickers/donneesEtiquette");

describe("stickers/donneesEtiquette", () => {
  it("n° de commande + exemplaire, ligne d'infos LM", () => {
    const d = donneesEtiquette(
      { client: "LM", ville: "Amiens", ref: 3612345678901, visuel: "JARDIN SECRET GAUCHE 80x210 MAT", format_visu: "1_80x210", visuelIndex: 1 },
      169580,
      "01/03",
    );
    expect(d.numEx).to.equal("169580 01/03");
    expect(d.orientation).to.equal("GAUCHE");
    expect(d.deco).to.equal("JARDIN SECRET GAUCHE");
    expect(d.format).to.equal("80X210");
    expect(d.infos).to.equal("AMIENS JARDIN SECRET GAUCHE GAUCHE 3612345678901 80X210");
  });

  it("STOCK remplace le numéro", () => {
    const d = donneesEtiquette({ client: "LM", showStock: true, visuelIndex: 1 }, 0, "01/01");
    expect(d.numEx).to.equal("STOCK");
    expect(d.numCmd).to.equal("");
  });

  it("CASTO : nom après le format, 2e visuel", () => {
    const d = donneesEtiquette(
      {
        client: "CASTO",
        visuel: "x",
        visuel2: "CRED 300x60cm MOSAIQUE 3664711694254 MAT.pdf",
        ref2: 3664711694254,
        format2_visu: "2_300x60",
        visuelIndex: 2,
      },
      12,
      "02/02",
    );
    expect(d.deco).to.equal("MOSAIQUE");
    expect(d.ref).to.equal("3664711694254");
    expect(d.format).to.equal("300X60");
  });

  it("BRICO : nom avant le format", () => {
    const d = donneesEtiquette({ client: "BRICO", visuel: "VELTIS BRILLANT 255x60 VELTIS-25560", visuelIndex: 1 }, 1, "01/01");
    expect(d.deco).to.equal("VELTIS BRILLANT");
    expect(d.infos).to.contain("FORMAT INCONNU");
  });

  it("sur-mesure : orientation, format et miniature propres au panneau", () => {
    const d = donneesEtiquette(
      { client: "LM", smBase: "169580-1 LM AMIENS", orientation: "DROIT", smFormat: "80x210", ville: "AMIENS", ref: "R1", visuelIndex: 1 },
      169580,
      "02/03",
      { jpgSurMesureDir: "C:/jpg/PRINTSA#1" },
    );
    expect(d.orientation).to.equal("DROIT");
    expect(d.infos).to.equal("AMIENS R1 DROIT 80X210");
    expect(d.miniaturePath).to.be.a("string").and.contain("169580-1 LM AMIENS");
  });

  it("remplacerJetons : valeurs connues remplacées, jeton inconnu conservé", () => {
    expect(remplacerJetons("{numEx} - {ville} {inconnu}", { numEx: "1 01/01", ville: "LILLE" })).to.equal("1 01/01 - LILLE {inconnu}");
  });
});
