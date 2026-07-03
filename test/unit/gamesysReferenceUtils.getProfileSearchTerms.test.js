const { expect } = require("chai");
const { getProfileSearchTerms } = require("../../server/src/gamesys/utils/reference");

describe("reference.getProfileSearchTerms()", () => {
  it("ne force pas le terme PROFILE pour un libellé de cornière", () => {
    // Bug réel : "CORNIERE PLATE 255cm" et "CORNIERE D'ANGLE 255cm" ne matchent
    // jamais aucune ligne de stock Gamesys car leur libellé st_lib_1_conso/st_modele
    // ne contient jamais le mot "PROFILE" — la recherche SQL combine les termes en
    // AND, donc le terme "PROFILE" forcé fait échouer la recherche à coup sûr.
    const terms = getProfileSearchTerms("CORNIERE PLATE 255cm");

    expect(terms).to.not.include("PROFILE");
    expect(terms).to.include("CORNIERE");
  });

  it("conserve le terme PROFILE pour un libellé de profilé classique", () => {
    const terms = getProfileSearchTerms("PROFILE DE FINITION NOIR MAT 255cm");

    expect(terms).to.include("PROFILE");
  });
});
