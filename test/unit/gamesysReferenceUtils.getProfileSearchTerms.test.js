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

  it("distingue une cornière plate d'une cornière d'angle (SKU Gamesys distincts : CORNR-255 vs CHAMP-255)", () => {
    const plateTerms = getProfileSearchTerms("CORNIERE PLATE 255cm");
    const angleTerms = getProfileSearchTerms("CORNIERE D'ANGLE 255cm");

    expect(plateTerms).to.include("PLATE");
    expect(plateTerms).to.not.include("ANGLE");
    expect(angleTerms).to.include("ANGLE");
    expect(angleTerms).to.not.include("PLATE");
  });

  it("priorise le mot-clé de variante précis (RACCORD) sur le mot générique FINITION", () => {
    // Bug réel : "Profilé de finition brillant 300 raccord" est un article legacy où "de
    // finition" est le nom générique de la catégorie (présent dans les 4 variantes : fermeture,
    // raccord, angle interieur, angle exterieur), pas un marqueur exclusif de la variante A.
    // Exiger à la fois FINITION et RACCORD (AND) ne peut jamais matcher aucune ligne stock.
    const terms = getProfileSearchTerms("Profilé de finition brillant 300 raccord");

    expect(terms).to.include("RACCORD");
    expect(terms).to.not.include("FINITION");
  });

  it("détecte FERMETURE comme variante de base (equivalent legacy du marqueur Finition/A)", () => {
    const terms = getProfileSearchTerms("Profilé de finition mat 240 fermeture");

    expect(terms).to.include("FERMETURE");
    expect(terms).to.not.include("FINITION");
  });

  it("conserve FINITION quand aucune variante plus précise n'est mentionnée", () => {
    const terms = getProfileSearchTerms("PROFILE Alu Mat - A - Finition - 255cm");

    expect(terms).to.include("FINITION");
  });

  it("distingue MAT de BRILLANT (sinon une commande Mat peut résoudre vers un SKU Brillant)", () => {
    // Bug réel : "Profilé de finition mat 240 raccord" et "Profilé de finition brillant 300
    // raccord" résolvaient tous les deux vers la même ligne stock 255cm Brillant (94964382),
    // faute de terme de recherche distinguant la finition.
    const matTerms = getProfileSearchTerms("Profilé de finition mat 240 raccord");
    const brillantTerms = getProfileSearchTerms("Profilé de finition brillant 300 raccord");

    expect(matTerms).to.include("MAT");
    expect(matTerms).to.not.include("BRILLANT");
    expect(brillantTerms).to.include("BRILLANT");
    expect(brillantTerms).to.not.include("MAT");
  });

  it("distingue les longueurs 240 et 300 (pas seulement 210/255)", () => {
    const terms240 = getProfileSearchTerms("Profilé de finition mat 240 raccord");
    const terms300 = getProfileSearchTerms("Profilé de finition brillant 300 raccord");

    expect(terms240).to.include("240");
    expect(terms240).to.not.include("300");
    expect(terms300).to.include("300");
    expect(terms300).to.not.include("240");
  });
});
