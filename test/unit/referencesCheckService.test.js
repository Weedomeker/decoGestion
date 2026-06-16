const { expect } = require("chai");
const {
  extractRefFromFilename,
  extractFormatFromFilename,
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
