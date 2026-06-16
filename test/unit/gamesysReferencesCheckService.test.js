const { expect } = require("chai");
const { compareClientReferencesWithGamesys } = require("../../server/src/services/gamesysReferencesCheckService");

describe("gamesysReferencesCheckService", () => {
  describe("compareClientReferencesWithGamesys()", () => {
    it("ne signale rien quand la référence est trouvée côté Gamesys", () => {
      const dbRefs = [{ ref: "111", model: "ACIER", format: "100x210" }];
      const stockMatches = new Map([
        ["111", { st_modele: "ACIER", st_lib_1_conso: "ACIER MAT", st_lib_2_conso: "" }],
      ]);

      const result = compareClientReferencesWithGamesys(dbRefs, stockMatches, "LM");

      expect(result.notFoundInGamesys).to.have.lengthOf(0);
      expect(result.stats).to.deep.equal({ refsInDb: 1, notFoundCount: 0 });
    });

    it("signale une référence introuvable côté Gamesys", () => {
      const dbRefs = [{ ref: "222", model: "MODELE", format: "100x210" }];
      const result = compareClientReferencesWithGamesys(dbRefs, new Map(), "LM");

      expect(result.notFoundInGamesys).to.deep.equal([{ ref: "222", model: "MODELE", client: "LM" }]);
      expect(result.stats).to.deep.equal({ refsInDb: 1, notFoundCount: 1 });
    });

    it("ne signale pas une référence trouvée même si le libellé Gamesys diffère totalement du modèle MongoDB", () => {
      // La référence fait foi : un libellé différent (naming propre à chaque système) n'est pas une erreur.
      const dbRefs = [{ ref: "333", model: "terrazzo gris", format: "300x60" }];
      const stockMatches = new Map([
        ["333", { st_modele: "TERRAZZO GR BEIGE (M)", st_lib_1_conso: "MAT", st_lib_2_conso: "" }],
      ]);

      const result = compareClientReferencesWithGamesys(dbRefs, stockMatches, "CASTO");

      expect(result.notFoundInGamesys).to.have.lengthOf(0);
    });

    it("retrouve une ligne fs_stock indexée via st_art_gencod (Map fournie par findStockByRefs)", () => {
      const dbRefs = [{ ref: "3664711694254", model: "MOSAIQUE", format: "300x60" }];
      const stockMatches = new Map([
        ["3664711694254", { st_modele: "MOSAIQUE", st_lib_1_conso: "", st_lib_2_conso: "" }],
      ]);

      const result = compareClientReferencesWithGamesys(dbRefs, stockMatches, "CASTO");

      expect(result.notFoundInGamesys).to.have.lengthOf(0);
    });
  });
});
