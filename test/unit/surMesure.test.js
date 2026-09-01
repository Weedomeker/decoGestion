const { expect } = require("chai");
const {
  isSurMesureLabel,
  parseSurMesureGabarit,
  parseSurMesureRefClient,
  classifySurMesure,
} = require("../../server/src/gamesys/utils/surMesure");

describe("surMesure util", () => {
  describe("isSurMesureLabel()", () => {
    it("reconnaît le gabarit SMES", () => {
      expect(isSurMesureLabel("Panneau déco sur-mesure 125x210 Finition Lisse")).to.equal(true);
    });
    it("reconnaît la forme 'Format fini : ...'", () => {
      expect(isSurMesureLabel(" Format fini : 100.0 x 255.0 cm ")).to.equal(true);
    });
    it("rejette un libellé catalogue standard", () => {
      expect(isSurMesureLabel("Travertino 125 x 255 cm (M)")).to.equal(false);
    });
    it("rejette vide / null", () => {
      expect(isSurMesureLabel("")).to.equal(false);
      expect(isSurMesureLabel(null)).to.equal(false);
    });
  });

  describe("parseSurMesureGabarit()", () => {
    it("extrait format + finition (Finition Lisse)", () => {
      expect(parseSurMesureGabarit("Panneau déco sur-mesure 100x210 Finition Lisse"))
        .to.deep.equal({ format: "100x210", finition: "LISSE" });
    });
    it("extrait la finition Texturée dé-accentuée", () => {
      expect(parseSurMesureGabarit("Panneau déco sur-mesure 125x210 Finition Texturée").finition)
        .to.equal("TEXTUREE");
    });
    it("gère la finition sans le mot 'Finition' (ex: '... 150x255 Brossé')", () => {
      expect(parseSurMesureGabarit("Panneau déco sur-mesure 150x255 Brossé").finition)
        .to.equal("BROSSE");
    });
    it("gère 'Format fini : 100.0 x 255.0 cm' → format 100x255, finition ''", () => {
      expect(parseSurMesureGabarit(" Format fini : 100.0 x 255.0 cm "))
        .to.deep.equal({ format: "100x255", finition: "" });
    });
    it("replie sur le suffixe du code tarif SMES quand le libellé n'a pas la finition", () => {
      expect(parseSurMesureGabarit("Format fini : 125.0 x 210.0 cm", "EC-SM125X210L").finition)
        .to.equal("LISSE");
    });
  });

  describe("parseSurMesureRefClient()", () => {
    it("ARCHE BEIGE CENTRE 86.9 X 201.5 MAT", () => {
      expect(parseSurMesureRefClient("ARCHE BEIGE CENTRE 86.9 X 201.5 MAT")).to.deep.equal({
        name: "ARCHE BEIGE",
        orientation: "CENTRE",
        printFormat: "86.9x201.5",
        finishHint: "MAT",
      });
    });
    it("BLANC ZERO 90 x 210 MAT (sans orientation)", () => {
      expect(parseSurMesureRefClient("BLANC ZERO 90 x 210 MAT")).to.deep.equal({
        name: "BLANC ZERO",
        orientation: null,
        printFormat: "90x210",
        finishHint: "MAT",
      });
    });
    it("BAMBUSA DROITE 80 X 230 MAT → orientation DROIT", () => {
      const r = parseSurMesureRefClient("BAMBUSA DROITE 80 X 230 MAT");
      expect(r.name).to.equal("BAMBUSA");
      expect(r.orientation).to.equal("DROIT");
      expect(r.printFormat).to.equal("80x230");
    });
    it("décimale virgule → point", () => {
      expect(parseSurMesureRefClient("X 86,9 X 201,5 MAT").printFormat).to.equal("86.9x201.5");
    });
    it("chaîne vide", () => {
      expect(parseSurMesureRefClient("")).to.deep.equal({
        name: "", orientation: null, printFormat: null, finishHint: null,
      });
    });

    // Patterns réels Gamesys (endv_ref_client texte libre inconstant)
    it("orientation après la cote : BRUME D'ASIE 100X210 GAUCHE", () => {
      const r = parseSurMesureRefClient("BRUME D'ASIE 100X210 GAUCHE");
      expect(r.name).to.equal("BRUME D'ASIE");
      expect(r.orientation).to.equal("GAUCHE");
      expect(r.printFormat).to.equal("100x210");
    });
    it("orientation collée aux chiffres : BRUME D'ASIE 100X210DROITE", () => {
      const r = parseSurMesureRefClient("BRUME D'ASIE 100X210DROITE");
      expect(r.name).to.equal("BRUME D'ASIE");
      expect(r.orientation).to.equal("DROIT");
      expect(r.printFormat).to.equal("100x210");
    });
    it("orientation doublée + espace irrégulier : MASSA 150 X255 DROITE DROITE MAT", () => {
      const r = parseSurMesureRefClient("MASSA 150 X255 DROITE DROITE MAT");
      expect(r.name).to.equal("MASSA");
      expect(r.orientation).to.equal("DROIT");
      expect(r.printFormat).to.equal("150x255");
    });
    it("préfixe SKU conservé dans le nom : ULM821 PIERRE D'ABBAYE 90X255 MAT", () => {
      const r = parseSurMesureRefClient("ULM821 PIERRE D'ABBAYE 90X255 MAT");
      expect(r.name).to.equal("ULM821 PIERRE D'ABBAYE");
      expect(r.orientation).to.equal(null);
      expect(r.printFormat).to.equal("90x255");
    });
    it("amalgame '+' : MASSA GAUCHE 80 X 255 + MASSA DROITE 45 X 255 MAT", () => {
      const r = parseSurMesureRefClient("MASSA GAUCHE 80 X 255 + MASSA DROITE 45 X 255 MAT");
      expect(r.name).to.equal("MASSA");
      expect(r.orientation).to.equal("GAUCHE"); // première occurrence
      expect(r.printFormat).to.equal("80x255"); // premier panneau
    });
  });

  describe("classifySurMesure()", () => {
    it("teinte connue → teinte_masse", () => {
      expect(classifySurMesure({ name: "BLANC ZERO" })).to.equal("teinte_masse");
    });
    it("nom de visuel → visuel", () => {
      expect(classifySurMesure({ name: "ARCHE BEIGE" })).to.equal("visuel");
    });
  });
});
