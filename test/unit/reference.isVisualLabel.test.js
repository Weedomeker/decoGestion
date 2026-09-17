const { expect } = require("chai");
const { isVisualLabel } = require("../../server/src/gamesys/utils/reference");

describe("reference.isVisualLabel()", () => {
  it("retourne true pour un libellé de visuel décoratif", () => {
    expect(isVisualLabel("VISUEL MOSAIQUE")).to.be.true;
  });

  it("retourne false pour un libellé de profilé", () => {
    expect(isVisualLabel("PROFIL BLANC 255")).to.be.false;
  });

  it("retourne false pour un libellé de cornière", () => {
    expect(isVisualLabel("CORNIERE PLATE 255cm")).to.be.false;
  });

  it("retourne false pour un libellé de kit de pose", () => {
    expect(isVisualLabel("KIT DE POSE")).to.be.false;
  });
});
