const { expect } = require("chai");
const { extractDimensionFormat, extractModelFromIdentif } = require("../../server/src/gamesys/services/dossierService");

describe("dossierService.extractDimensionFormat()", () => {
  it("extrait un format en cm tel quel", () => {
    expect(extractDimensionFormat("ONYX GAUCHE 125x255cm")).to.equal("125x255");
  });

  it("convertit un format exprimé en mm (>500) en cm", () => {
    expect(extractDimensionFormat("1000 x 2550")).to.equal("100x255");
  });

  it("retourne null si aucune dimension n'est trouvée", () => {
    expect(extractDimensionFormat("Kit de pose pour 1 panneau")).to.be.null;
  });

  it("gère une valeur vide/undefined", () => {
    expect(extractDimensionFormat("")).to.be.null;
    expect(extractDimensionFormat(undefined)).to.be.null;
  });
});

describe("dossierService.extractModelFromIdentif()", () => {
  it("retire la dimension pour isoler le nom du modèle", () => {
    expect(extractModelFromIdentif("ONYX GAUCHE 125x255cm")).to.equal("ONYX GAUCHE");
  });

  it("gère une valeur sans dimension", () => {
    expect(extractModelFromIdentif("Kit de pose pour 1 panneau")).to.equal("Kit de pose pour 1 panneau");
  });

  it("gère une valeur vide/undefined", () => {
    expect(extractModelFromIdentif("")).to.equal("");
    expect(extractModelFromIdentif(undefined)).to.equal("");
  });
});
