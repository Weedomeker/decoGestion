"use strict";
const assert = require("assert");
const { buildRenameTarget, classifyEntries } = require("../../server/scripts/verifyAndFixFiles");

describe("verifyAndFixFiles — fonctions pures", () => {
  describe("buildRenameTarget", () => {
    it("remplace la vieille ref par la nouvelle dans le nom de fichier", () => {
      assert.strictEqual(
        buildRenameTarget("MOSAIQUE 94953677 MAT.pdf", "94953677", "94953676"),
        "MOSAIQUE 94953676 MAT.pdf"
      );
    });

    it("ne modifie pas le nom si la vieille ref n'y figure pas", () => {
      assert.strictEqual(
        buildRenameTarget("MOSAIQUE 94953677 MAT.pdf", "00000000", "94953676"),
        "MOSAIQUE 94953677 MAT.pdf"
      );
    });

    it("remplace seulement la première occurrence", () => {
      assert.strictEqual(
        buildRenameTarget("12345678 12345678 MAT.pdf", "12345678", "99999999"),
        "99999999 12345678 MAT.pdf"
      );
    });
  });

  describe("classifyEntries", () => {
    const makeEntry = (ref, fileName = "test.pdf") => ({
      filePath: `/reseau/LM/${fileName}`,
      fileName,
      ref,
      format: "100x210",
      client: "LM",
    });

    it("classe un fichier OK quand sa ref est dans stockMap", () => {
      const entries = [makeEntry("94953676")];
      const stockMap = new Map([["94953676", { st_modele: "MOSAIQUE" }]]);
      const { ok, noRef, notInGamesys } = classifyEntries(entries, stockMap);
      assert.strictEqual(ok.length, 1);
      assert.strictEqual(noRef.length, 0);
      assert.strictEqual(notInGamesys.length, 0);
    });

    it("classe un fichier noRef quand ref est null", () => {
      const entries = [makeEntry(null, "SANS-REF.pdf")];
      const stockMap = new Map();
      const { ok, noRef, notInGamesys } = classifyEntries(entries, stockMap);
      assert.strictEqual(noRef.length, 1);
      assert.strictEqual(ok.length, 0);
    });

    it("classe un fichier notInGamesys quand sa ref n'est pas dans stockMap", () => {
      const entries = [makeEntry("99999999")];
      const stockMap = new Map();
      const { ok, noRef, notInGamesys } = classifyEntries(entries, stockMap);
      assert.strictEqual(notInGamesys.length, 1);
    });

    it("filtre les profils et teintes masse", () => {
      const entries = [
        { filePath: "/f/PROFIL BLANC.pdf", fileName: "PROFIL BLANC.pdf", ref: null, format: null, client: "LM" },
        { filePath: "/f/NOIR ZERO MAT.pdf", fileName: "NOIR ZERO MAT.pdf", ref: null, format: null, client: "LM" },
      ];
      const stockMap = new Map();
      const { ok, noRef, notInGamesys, excluded } = classifyEntries(entries, stockMap);
      assert.strictEqual(excluded.length, 2);
      assert.strictEqual(noRef.length, 0);
    });
  });
});
