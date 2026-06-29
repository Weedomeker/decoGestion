const { expect } = require("chai");

// Logique CJS miroir de client/src/utils/referenceValidation.js
// (impossible de require() un module ESM directement depuis mocha CJS)
function isDefinitelyWrongClient(fileName, client) {
  const name = fileName.split(/[\\/]/).pop();
  const hasEAN13    = /(?<!\d)\d{13}(?!\d)/.test(name);
  const has8digit   = /(?<!\d)\d{8}(?!\d)/.test(name);
  const hasAlphanum = /[A-Z]+\d*-\d+/.test(name);

  if (hasEAN13 && client !== "CASTO") return true;
  if (has8digit && !hasEAN13 && !hasAlphanum && client !== "LM") return true;
  if (hasAlphanum && !has8digit && !hasEAN13 && client === "LM") return true;

  return false;
}

describe("isDefinitelyWrongClient()", () => {
  describe("EAN-13 (CASTO) dans un dossier non-CASTO", () => {
    it("rejette un fichier CASTO dans LM", () => {
      expect(isDefinitelyWrongClient("MOSAIQUE 3664711694254 MAT.pdf", "LM")).to.be.true;
    });
    it("rejette un fichier CASTO dans BRICO", () => {
      expect(isDefinitelyWrongClient("CRED 300x60 3664714023259 MAT.pdf", "BRICO")).to.be.true;
    });
    it("rejette un fichier CASTO dans ECOM", () => {
      expect(isDefinitelyWrongClient("3664711694254.pdf", "ECOM")).to.be.true;
    });
    it("accepte un fichier CASTO dans CASTO", () => {
      expect(isDefinitelyWrongClient("MOSAIQUE 3664711694254 MAT.pdf", "CASTO")).to.be.false;
    });
  });

  describe("Ref 8 chiffres (LM) dans un dossier non-LM", () => {
    it("rejette un fichier LM dans CASTO", () => {
      expect(isDefinitelyWrongClient("ACIER 94963978 MAT.pdf", "CASTO")).to.be.true;
    });
    it("rejette un fichier LM dans BRICO", () => {
      expect(isDefinitelyWrongClient("ACIER 100x255 94963978 MAT.pdf", "BRICO")).to.be.true;
    });
    it("rejette un fichier LM dans ECOM", () => {
      expect(isDefinitelyWrongClient("94963978 MAT.pdf", "ECOM")).to.be.true;
    });
    it("accepte un fichier LM dans LM", () => {
      expect(isDefinitelyWrongClient("ACIER 94963978 MAT.pdf", "LM")).to.be.false;
    });
    it("n'exclut pas un EAN-13 CASTO (contient 8 chiffres inclus)", () => {
      // 3664711694254 contient plusieurs séquences de 8 chiffres mais toutes
      // entourées d'autres chiffres → has8digit = false
      expect(isDefinitelyWrongClient("3664711694254 MAT.pdf", "BRICO")).to.be.true; // EAN-13 rule fire
    });
  });

  describe("Ref alphanum (BRICO/ECOM) dans LM", () => {
    it("rejette un fichier BRICO dans LM", () => {
      expect(isDefinitelyWrongClient("VELTIS BRILLANT 255x60 VELTIS-25560.pdf", "LM")).to.be.true;
    });
    it("rejette un fichier ECOM dans LM", () => {
      expect(isDefinitelyWrongClient("ALOHA 100x210 ALOHAD-100210 MAT.pdf", "LM")).to.be.true;
    });
    it("accepte un fichier BRICO dans BRICO", () => {
      expect(isDefinitelyWrongClient("VELTIS-25560.pdf", "BRICO")).to.be.false;
    });
    it("accepte un fichier ECOM dans ECOM", () => {
      expect(isDefinitelyWrongClient("ALOHAD-100210 MAT.pdf", "ECOM")).to.be.false;
    });
    it("ne peut pas distinguer BRICO de ECOM (format identique)", () => {
      expect(isDefinitelyWrongClient("VELTIS-25560.pdf", "ECOM")).to.be.false;
      expect(isDefinitelyWrongClient("ALOHAD-100210 MAT.pdf", "BRICO")).to.be.false;
    });
  });

  describe("Cas limites", () => {
    it("nom de fichier vide → false", () => {
      expect(isDefinitelyWrongClient("", "LM")).to.be.false;
    });
    it("fichier sans ref reconnaissable → conservé", () => {
      expect(isDefinitelyWrongClient("VISUEL GENERIQUE MAT.pdf", "LM")).to.be.false;
    });
    it("chemin complet → utilise le basename", () => {
      expect(isDefinitelyWrongClient("C:/partage/LM/150x200/ACIER 94963978 MAT.pdf", "CASTO")).to.be.true;
    });
  });
});
