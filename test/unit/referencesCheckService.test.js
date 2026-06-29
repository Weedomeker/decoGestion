const { expect } = require("chai");
const {
  extractRefFromFilename,
  extractFormatFromFilename,
  validateRefFormat,
  compareClientReferences,
} = require("../../server/src/services/referencesCheckService");

describe("referencesCheckService", () => {
  describe("extractRefFromFilename()", () => {
    const cases = [
      { fileName: "ACIER 100x255 94963978 MAT.pdf", client: "LM", expected: "94963978" },
      { fileName: "CRED 300x60cm MOSAIQUE 3664711694254 MAT.pdf", client: "CASTO", expected: "3664711694254" },
      { fileName: "VELTIS BRILLANT 255x60 VELTIS-25560.pdf", client: "BRICO", expected: "VELTIS-25560" },
      { fileName: "ALOHA 100x210 ALOHAD-100210 MAT.pdf", client: "ECOM", expected: "ALOHAD-100210" },
    ];

    cases.forEach(({ fileName, client, expected }) => {
      it(`${client} : "${fileName}" → "${expected}"`, () => {
        expect(extractRefFromFilename(fileName, client)).to.equal(expected);
      });
    });

    it("retourne null quand aucune référence n'est reconnaissable", () => {
      expect(extractRefFromFilename("VISUEL SANS REFERENCE.pdf", "LM")).to.be.null;
      expect(extractRefFromFilename("VISUEL SANS REFERENCE.pdf", "BRICO")).to.be.null;
    });

    it("LM : n'extrait pas 8 chiffres depuis un EAN-13 CASTO (faux positif)", () => {
      expect(extractRefFromFilename("CRED 300x60cm MOSAIQUE 3664711694254 MAT.pdf", "LM")).to.be.null;
    });

    it("CASTO : n'extrait pas l'EAN-13 depuis une ref LM 8 chiffres (impossible)", () => {
      expect(extractRefFromFilename("ACIER 100x255 94963978 MAT.pdf", "CASTO")).to.be.null;
    });

    it("LM alphanumérique : retourne null (LM = 8 chiffres uniquement)", () => {
      expect(extractRefFromFilename("AURALIN NATUREL MAT 100x210 AURALIN-100210.pdf", "LM")).to.be.null;
    });

    it("BRICO/ECOM : pas de 'x' dans la partie numérique de la ref", () => {
      // VELTIS-25560 (pas VELTIS-255x60)
      expect(extractRefFromFilename("VELTIS BRILLANT 255x60 VELTIS-25560.pdf", "BRICO")).to.equal("VELTIS-25560");
      expect(extractRefFromFilename("ALOHA 100x210 ALOHAD-100210 MAT.pdf", "ECOM")).to.equal("ALOHAD-100210");
    });
  });

  describe("validateRefFormat()", () => {
    it("LM 8 chiffres : valide", () => expect(validateRefFormat("94963978", "LM")).to.be.true);
    it("LM alphanumérique : invalide (LM = 8 chiffres uniquement)", () => expect(validateRefFormat("AURALIN-100210", "LM")).to.be.false);
    it("LM avec chiffres dans le préfixe : invalide (LM = 8 chiffres uniquement)", () => expect(validateRefFormat("U548-100210", "LM")).to.be.false);
    it("LM 7 chiffres : invalide", () => expect(validateRefFormat("9496397", "LM")).to.be.false);
    it("LM 9 chiffres : invalide", () => expect(validateRefFormat("949639780", "LM")).to.be.false);
    it("LM EAN-13 : invalide", () => expect(validateRefFormat("3664711694254", "LM")).to.be.false);

    it("CASTO EAN-13 : valide", () => expect(validateRefFormat("3664711694254", "CASTO")).to.be.true);
    it("CASTO 12 chiffres : invalide", () => expect(validateRefFormat("366471169425", "CASTO")).to.be.false);
    it("CASTO 14 chiffres : invalide", () => expect(validateRefFormat("36647116942541", "CASTO")).to.be.false);

    it("BRICO format correct sans 'x' : valide", () => expect(validateRefFormat("VELTIS-25560", "BRICO")).to.be.true);
    it("BRICO format 6 chiffres : valide", () => expect(validateRefFormat("CALACA-100255", "BRICO")).to.be.true);
    it("BRICO avec 'x' dans les chiffres : invalide", () => expect(validateRefFormat("VELTIS-255x60", "BRICO")).to.be.false);
    it("BRICO trop peu de chiffres (<4) : invalide", () => expect(validateRefFormat("AB-25", "BRICO")).to.be.false);

    it("ECOM format correct : valide", () => expect(validateRefFormat("HOKUSAID-100210", "ECOM")).to.be.true);
    it("ECOM sans lettres : invalide", () => expect(validateRefFormat("100210", "ECOM")).to.be.false);
  });

  describe("extractFormatFromFilename()", () => {
    it("extrait un format standard", () => {
      expect(extractFormatFromFilename("ACIER 100x255 94963978 MAT.pdf")).to.equal("100x255");
    });

    it("retourne null si aucun format n'est présent", () => {
      expect(extractFormatFromFilename("ACIER 94963978 MAT.pdf")).to.be.null;
    });
  });

  describe("compareClientReferences()", () => {
    it("ne signale rien quand fichiers et base correspondent", () => {
      const fileEntries = [{ filePath: "p/A.pdf", fileName: "A.pdf", ref: "111", format: "100x210", client: "LM" }];
      const dbRefs = [{ ref: "111", model: "ACIER", format: "100x210" }];

      const result = compareClientReferences(fileEntries, dbRefs, "LM");

      expect(result.orphanFiles).to.have.lengthOf(0);
      expect(result.missingFiles).to.have.lengthOf(0);
      expect(result.formatMismatches).to.have.lengthOf(0);
      expect(result.stats).to.deep.equal({
        filesScanned: 1,
        refsInDb: 1,
        orphanCount: 0,
        missingCount: 0,
        mismatchCount: 0,
      });
    });

    it("signale un fichier orphelin (ref absente de la base)", () => {
      const fileEntries = [{ filePath: "p/B.pdf", fileName: "B.pdf", ref: "222", format: "100x210", client: "LM" }];
      const result = compareClientReferences(fileEntries, [], "LM");

      expect(result.orphanFiles).to.have.lengthOf(1);
      expect(result.orphanFiles[0]).to.include({ ref: "222", extractionFailed: false });
    });

    it("signale une référence en base sans fichier", () => {
      const dbRefs = [{ ref: "333", model: "MODELE", format: "100x210" }];
      const result = compareClientReferences([], dbRefs, "LM");

      expect(result.missingFiles).to.deep.equal([{ ref: "333", model: "MODELE", format: "100x210", client: "LM" }]);
    });

    it("signale une incohérence de format pour une ref présente des deux côtés", () => {
      const fileEntries = [{ filePath: "p/C.pdf", fileName: "C.pdf", ref: "444", format: "100x210", client: "LM" }];
      const dbRefs = [{ ref: "444", model: "MODELE", format: "100x255" }];

      const result = compareClientReferences(fileEntries, dbRefs, "LM");

      expect(result.missingFiles).to.have.lengthOf(0);
      expect(result.formatMismatches).to.deep.equal([
        { ref: "444", fileName: "C.pdf", fileFormat: "100x210", dbFormat: "100x255", client: "LM" },
      ]);
    });

    it("signale un fichier dont la référence n'a pas pu être extraite sans planter", () => {
      const fileEntries = [{ filePath: "p/D.pdf", fileName: "D.pdf", ref: null, format: null, client: "LM" }];
      const result = compareClientReferences(fileEntries, [], "LM");

      expect(result.orphanFiles).to.have.lengthOf(1);
      expect(result.orphanFiles[0]).to.include({ ref: null, extractionFailed: true });
    });

    it("ne signale pas une ref manquante si au moins un fichier la couvre (doublons finition)", () => {
      const fileEntries = [
        { filePath: "p/E1.pdf", fileName: "E1.pdf", ref: "555", format: "100x210", client: "LM" },
        { filePath: "p/E2.pdf", fileName: "E2.pdf", ref: "555", format: "100x210", client: "LM" },
      ];
      const dbRefs = [{ ref: "555", model: "MODELE", format: "100x210" }];

      const result = compareClientReferences(fileEntries, dbRefs, "LM");

      expect(result.missingFiles).to.have.lengthOf(0);
      expect(result.orphanFiles).to.have.lengthOf(0);
    });
  });
});
