const { expect } = require("chai");
const path = require("path");
const { pathToFileURL } = require("url");

// Module ESM du client chargé tel quel (pas de copie miroir à maintenir).
const modulePath = pathToFileURL(path.join(__dirname, "../../client/src/utils/formatTauro.js")).href;

// Contenu de server/formatsTauro.conf sur le poste de prod (19/10/2026)
const FORMATS_PROD = ["Deco_Std_101x215", "Deco_Std_126x260", "Deco_Std_150x305", "Deco_Std_151x260"];

describe("findFormatTauro", () => {
  let findFormatTauro;

  before(async () => {
    ({ findFormatTauro } = await import(modulePath));
  });

  it("retourne le format exact quand il existe", () => {
    expect(findFormatTauro(FORMATS_PROD, "126x260")).to.equal("Deco_Std_126x260");
    expect(findFormatTauro(FORMATS_PROD, "151x260")).to.equal("Deco_Std_151x260");
  });

  it("125x260 (plaque Gamesys des BLANC ZERO 125x2xx) → plus petite plaque qui le contient : 126x260", () => {
    expect(findFormatTauro(FORMATS_PROD, "125x260")).to.equal("Deco_Std_126x260");
  });

  it("choisit la plaque de plus petite surface parmi celles qui contiennent le format", () => {
    expect(findFormatTauro(FORMATS_PROD, "100x210")).to.equal("Deco_Std_101x215");
    expect(findFormatTauro(FORMATS_PROD, "140x300")).to.equal("Deco_Std_150x305");
  });

  it("ignore la casse", () => {
    expect(findFormatTauro(FORMATS_PROD, "126X260")).to.equal("Deco_Std_126x260");
  });

  it("retourne une chaîne vide si aucune plaque ne contient le format", () => {
    expect(findFormatTauro(FORMATS_PROD, "160x320")).to.equal("");
  });

  it("retourne une chaîne vide sans format ou sans liste", () => {
    expect(findFormatTauro(FORMATS_PROD, "")).to.equal("");
    expect(findFormatTauro(FORMATS_PROD, undefined)).to.equal("");
    expect(findFormatTauro([], "126x260")).to.equal("");
    expect(findFormatTauro(undefined, "126x260")).to.equal("");
  });

  it("ne retient pas une entrée sans dimensions parsables pour le repli", () => {
    expect(findFormatTauro(["Prod avec BLANC", "Deco_Std_126x260"], "125x260")).to.equal("Deco_Std_126x260");
  });
});
