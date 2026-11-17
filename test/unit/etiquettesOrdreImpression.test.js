const { expect } = require("chai");
const { trierFichiersEtiquettes } = require("../../server/src/generateStickers");

// Sessions Tauro : les pages d'étiquettes (une par commande) suivent l'ordre d'impression,
// pas le n° de commande ; une commande se place à sa première plaque imprimée.
describe("étiquettes dans l'ordre d'impression", () => {
  const fichiers = [
    "168860_M_100x210_01.pdf",
    "168860_M_150x210_02.pdf",
    "169818_M_150x255_01.pdf",
    "169406_M_150x255_01.pdf",
    "168866_M_100x255_01.pdf",
  ];

  it("suit l'ordre des commandes donné ; une commande hors liste passe à la fin", () => {
    const tries = trierFichiersEtiquettes(fichiers, ["169818", "169406", "168860"]);
    expect(tries.map((f) => f.slice(0, 6))).to.deep.equal(["169818", "169406", "168860", "168860", "168866"]);
  });

  it("dans une commande, garde le tri habituel (plus grand format d'abord)", () => {
    const tries = trierFichiersEtiquettes(fichiers, ["168860"]);
    expect(tries.slice(0, 2)).to.deep.equal(["168860_M_150x210_02.pdf", "168860_M_100x210_01.pdf"]);
  });

  it("sans ordre : tri habituel par n° de commande", () => {
    expect(trierFichiersEtiquettes(fichiers).map((f) => f.slice(0, 6))).to.deep.equal([
      "168860",
      "168860",
      "168866",
      "169406",
      "169818",
    ]);
  });
});
