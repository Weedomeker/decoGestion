const { expect } = require("chai");
const path = require("path");
const { pathToFileURL } = require("url");
const { credenceEmprise, plaqueTropPetite } = require("../../server/src/utils/credencePlaque");

const FORMATS_PROD = ["Deco_Std_101x215", "Deco_Std_126x260", "Deco_Std_150x305", "Deco_Std_151x260"];
const CASTO_255 = "server/public/CASTO/1_255x60/";
const CASTO_300 = "server/public/CASTO/2_300x60/";

// Amalgame CASTO 255x60 + 300x60 : l'appairage gardait la plaque du 1er panneau (126x260),
// le 300x60 sortait rogné à 260 cm sans aucune erreur.
describe("credencePlaque (serveur)", () => {
  it("emprise de 2 crédences côte à côte : largeurs additionnées, plus grande longueur", () => {
    expect(credenceEmprise(CASTO_255, CASTO_300)).to.deep.equal({ width: 120, height: 300 });
    expect(credenceEmprise(CASTO_255, CASTO_255)).to.deep.equal({ width: 120, height: 255 });
  });

  it("emprise d'une crédence seule", () => {
    expect(credenceEmprise(CASTO_300, "")).to.deep.equal({ width: 60, height: 300 });
  });

  it("pas d'emprise hors crédence", () => {
    expect(credenceEmprise("server/public/LM/2_100x210/", "")).to.equal(null);
  });

  it("126x260 trop petite pour 255x60 + 300x60, 150x305 suffit", () => {
    expect(plaqueTropPetite("126x260", CASTO_255, CASTO_300)).to.deep.equal({ width: 120, height: 300 });
    expect(plaqueTropPetite("150x305", CASTO_255, CASTO_300)).to.equal(null);
  });

  it("126x260 suffit pour 2 x 255x60", () => {
    expect(plaqueTropPetite("126x260", CASTO_255, CASTO_255)).to.equal(null);
  });
});

describe("plaqueCredences (client)", () => {
  let plaqueCredences;

  before(async () => {
    ({ plaqueCredences } = await import(
      pathToFileURL(path.join(__dirname, "../../client/src/utils/credence.js")).href
    ));
  });

  it("passe à 150x305 quand un 300x60 rejoint un 255x60 posé en 126x260", () => {
    expect(plaqueCredences(FORMATS_PROD, "Deco_Std_126x260", CASTO_255, CASTO_300)).to.equal("Deco_Std_150x305");
  });

  it("garde la plaque courante quand elle contient les 2 panneaux", () => {
    expect(plaqueCredences(FORMATS_PROD, "Deco_Std_126x260", CASTO_255, CASTO_255)).to.equal("Deco_Std_126x260");
    expect(plaqueCredences(FORMATS_PROD, "Deco_Std_150x305", CASTO_255, CASTO_300)).to.equal("Deco_Std_150x305");
  });

  it("choisit une plaque quand aucune n'est encore choisie", () => {
    expect(plaqueCredences(FORMATS_PROD, null, CASTO_300, CASTO_255)).to.equal("Deco_Std_150x305");
  });

  it("ne touche pas à la plaque sans 2e panneau crédence", () => {
    expect(plaqueCredences(FORMATS_PROD, "Deco_Std_126x260", CASTO_255, "")).to.equal("Deco_Std_126x260");
  });
});
