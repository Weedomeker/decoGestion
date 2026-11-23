const { expect } = require("chai");
const { finitionDuVernis } = require("../../server/src/surMesure/finition");

describe("surMesure/finition", () => {
  it("écrit le vernis du panneau avec la casse des fiches Deco", () => {
    expect(finitionDuVernis("MAT")).to.equal("Mat");
    expect(finitionDuVernis("BRILLANT")).to.equal("Brillant");
    expect(finitionDuVernis("brillant")).to.equal("Brillant");
  });

  it("ne donne rien sans vernis connu : la fiche garde alors sa finition", () => {
    expect(finitionDuVernis(null)).to.equal(undefined);
    expect(finitionDuVernis("")).to.equal(undefined);
    expect(finitionDuVernis("SATIN")).to.equal(undefined);
  });
});
