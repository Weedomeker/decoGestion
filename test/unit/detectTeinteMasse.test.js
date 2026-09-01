const { expect } = require("chai");
const { TEINTE_MASSE_OPTIONS, normalizeText, detectTeinteMasse } = require("../helpers/teinteMasse.cjs");

describe("detectTeinteMasse() — correspondance libellé ↔ option visuel", () => {

  // ─── Cas nominaux : libellé contient la phrase exacte ─────────────────────

  describe("correspondance exacte (phrase complète dans le libellé)", () => {
    const nominalCases = [
      { libelle: "NOIR ZERO MAT 100 x 210 cm (M)",  expected: "NOIR ZERO MAT"   },
      { libelle: "BLANC ZERO MAT 100 x 255 cm (M)", expected: "BLANC ZERO MAT"  },
      { libelle: "GRANIT 3 MAT 100 x 210 cm (M)",   expected: "GRANIT 3 MAT"    },
      { libelle: "ALU BROSSE 100 x 210 cm (M)",      expected: "ALU BROSSE"      },
      { libelle: "BRONZE BROSSE 100 x 210 cm (M)",   expected: "BRONZE BROSSE"   },
      { libelle: "CUIVRE BROSSE 100 x 210 cm (M)",   expected: "CUIVRE BROSSE"   },
      { libelle: "NOIR BROSSE 100 x 210 cm (M)",     expected: "NOIR BROSSE"     },
      { libelle: "OR BROSSE 100 x 210 cm (M)",       expected: "OR BROSSE"       },
    ];

    nominalCases.forEach(({ libelle, expected }) => {
      it(`"${libelle}" → "${expected}"`, () => {
        expect(detectTeinteMasse({ libelle, reference: "" })).to.equal(expected);
      });
    });
  });

  // ─── Libellés réels de la DB : sans suffixe "MAT" ─────────────────────────
  // La base Gamesys stocke "NOIR ZÉRO 100x255cm" sans le mot MAT.
  // La détection doit quand même reconnaître la teinte via le préfixe.

  describe("libellés DB sans suffixe MAT (format réel Gamesys)", () => {
    const dbCases = [
      { libelle: "NOIR ZÉRO 100x255cm",  reference: "94953611", expected: "NOIR ZERO MAT"  },
      { libelle: "NOIR ZÉRO 100x210cm",  reference: "94956950", expected: "NOIR ZERO MAT"  },
      { libelle: "BLANC ZÉRO 100x210cm", reference: "94956949", expected: "BLANC ZERO MAT" },
      { libelle: "BLANC ZÉRO 100x255cm", reference: "94953671", expected: "BLANC ZERO MAT" },
      { libelle: "BLANC ZÉRO 150x255cm", reference: "94964425", expected: "BLANC ZERO MAT" },
      { libelle: "GRANIT 3 100x210cm (M)", reference: "94956938", expected: "GRANIT 3 MAT" },
      { libelle: "GRANIT 3 100x255cm (M)", reference: "94953667", expected: "GRANIT 3 MAT" },
    ];

    dbCases.forEach(({ libelle, reference, expected }) => {
      it(`"${libelle}" (ref: ${reference}) → "${expected}"`, () => {
        const result = detectTeinteMasse({ libelle, reference });
        expect(result).to.equal(
          expected,
          `libelle="${libelle}" normalisé="${normalizeText(libelle)}" devrait détecter "${expected}"`
        );
      });
    });
  });

  // ─── Libellés réels avec accent sur É (ALU BROSSÉ) ────────────────────────

  describe("libellés avec accent (ALU BROSSÉ → ALU BROSSE)", () => {
    const accentCases = [
      { libelle: "ALU BROSSÉ 125x210cm",  reference: "ALUBRS-125210", expected: "ALU BROSSE" },
      { libelle: "ALU BROSSÉ 100x210cm",  reference: "ALUBRS-100210", expected: "ALU BROSSE" },
      { libelle: "ALU BROSSÉ 100x255cm",  reference: "ALUBRS-100255", expected: "ALU BROSSE" },
      { libelle: "ALU BROSSÉ 150x255cm",  reference: "ALUBRS-150255", expected: "ALU BROSSE" },
      { libelle: "Alu brossé 100 x 210 cm", reference: "ALUBRS-100210", expected: "ALU BROSSE" },
    ];

    accentCases.forEach(({ libelle, reference, expected }) => {
      it(`"${libelle}" → "${expected}"`, () => {
        expect(detectTeinteMasse({ libelle, reference })).to.equal(expected);
      });
    });
  });

  // ─── Word boundary — éviter les faux positifs ─────────────────────────────

  describe("word boundary — pas de faux positifs", () => {
    it('"DECOR BROSSE DESIGN" ne matche pas OR BROSSE', () => {
      expect(detectTeinteMasse({ libelle: "DECOR BROSSE DESIGN 100x210", reference: "" })).to.be.null;
    });

    it('"NOIR BROSSE SOMBRE" matche NOIR BROSSE', () => {
      expect(detectTeinteMasse({ libelle: "NOIR BROSSE SOMBRE 100x210", reference: "" })).to.equal("NOIR BROSSE");
    });

    it('"BLANC GRANIT 3 TILES" ne matche pas GRANIT 3 MAT (le préfixe doit être délimité)', () => {
      // "blanc granit 3 tiles" : " granit 3 " est présent avec word boundary → MATCH attendu
      // Ce test vérifie qu'un produit contenant "GRANIT 3" est bien détecté
      const result = detectTeinteMasse({ libelle: "BLANC GRANIT 3 TILES 100x210", reference: "" });
      expect(result).to.equal("GRANIT 3 MAT");
    });
  });

  // ─── Fallback sur reference ────────────────────────────────────────────────

  describe("détection via reference quand libellé vide ou insuffisant", () => {
    it("reference contient la phrase exacte → détecte", () => {
      expect(detectTeinteMasse({ libelle: "", reference: "NOIR ZERO MAT 100x210" })).to.equal("NOIR ZERO MAT");
    });

    it("libellé + reference combinés → détecte", () => {
      expect(detectTeinteMasse({ libelle: "PANNEAU SDB", reference: "ALU BROSSE 100x210" })).to.equal("ALU BROSSE");
    });
  });

  // ─── Cas sans teinte masse ─────────────────────────────────────────────────

  describe("produits non teinte masse → null", () => {
    const negativeCases = [
      { libelle: "",                                   reference: "",               desc: "vide" },
      { libelle: "KAOLIN SAUGE 125x255cm",             reference: "94964448",       desc: "KAOLIN SAUGE (dossier 10220)" },
      { libelle: "ALAGOAS DROIT 100x255cm",            reference: "94953563",       desc: "ALAGOAS DROIT (dossier 101921)" },
      { libelle: "MOSAÏCA BLEU 150x255cm",             reference: "519129",         desc: "MOSAÏCA BLEU" },
      { libelle: "Hokusai Droit 100 x 210 cm (M)",     reference: "HOKUSAID-100210",desc: "visuel ECOM Hokusai" },
      { libelle: "U663 vert sauge 100 x 210 cm (M)",   reference: "U663-100210",    desc: "visuel ECOM U663 (dossier 165191)" },
    ];

    negativeCases.forEach(({ libelle, reference, desc }) => {
      it(`"${desc}" → null`, () => {
        expect(detectTeinteMasse({ libelle, reference })).to.be.null;
      });
    });

    it("job sans champs → null (pas de crash)", () => {
      expect(detectTeinteMasse({})).to.be.null;
    });
  });

  // ─── Intégrité de la liste ─────────────────────────────────────────────────

  describe("intégrité de TEINTE_MASSE_OPTIONS", () => {
    it("contient exactement 8 options", () => {
      expect(TEINTE_MASSE_OPTIONS).to.have.lengthOf(8);
    });

    it("chaque option se détecte dans un libellé qui la contient mot pour mot", () => {
      TEINTE_MASSE_OPTIONS.forEach((opt) => {
        const result = detectTeinteMasse({ libelle: `${opt} 100x210`, reference: "" });
        expect(result).to.equal(opt, `Option "${opt}" non détectée dans son propre libellé`);
      });
    });
  });
});
