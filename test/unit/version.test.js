const { expect } = require("chai");
const { parseVersion, compareVersions, bumpVersion } = require("../../server/src/utils/version");

describe("utils/version", () => {
  describe("parseVersion()", () => {
    it("accepte X.Y.Z avec ou sans préfixe v", () => {
      expect(parseVersion("2.3.0")).to.deep.equal([2, 3, 0]);
      expect(parseVersion("v10.0.12")).to.deep.equal([10, 0, 12]);
    });

    it("renvoie null pour une version invalide", () => {
      expect(parseVersion("2.3")).to.equal(null);
      expect(parseVersion("abc")).to.equal(null);
      expect(parseVersion(undefined)).to.equal(null);
    });
  });

  describe("compareVersions()", () => {
    it("compare numériquement (10 > 9), pas lexicographiquement", () => {
      expect(compareVersions("2.10.0", "2.9.0")).to.equal(1);
      expect(compareVersions("2.3.0", "2.3.1")).to.equal(-1);
      expect(compareVersions("v2.3.0", "2.3.0")).to.equal(0);
    });

    it("traite une version invalide comme 0.0.0", () => {
      expect(compareVersions("abc", "0.0.1")).to.equal(-1);
      expect(compareVersions(null, "0.0.0")).to.equal(0);
    });
  });

  describe("bumpVersion()", () => {
    it("incrémente et remet à zéro les niveaux inférieurs", () => {
      expect(bumpVersion("2.3.4", "major")).to.equal("3.0.0");
      expect(bumpVersion("2.3.4", "minor")).to.equal("2.4.0");
      expect(bumpVersion("v2.3.4", "patch")).to.equal("2.3.5");
    });

    it("refuse une version ou un niveau invalide", () => {
      expect(() => bumpVersion("2.3", "patch")).to.throw(/invalide/);
      expect(() => bumpVersion("2.3.0", "huge")).to.throw(/inconnu/);
    });
  });
});
