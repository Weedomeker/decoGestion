const assert = require("node:assert/strict");
const { totalEx, ligneFormat } = require("../../client/src/utils/totalEx.js");

describe("File : total d'ex. (totalEx)", () => {
  const j = (plaque, ex, o = {}) => ({ format_Plaque: `Deco_Std_${plaque}`, visuel: "ONYX 150x210 MAT.pdf", ex, ...o });

  it("total, détail par plaque du plus grand au plus petit, Mat / Brillant", () => {
    const t = totalEx([
      j("101x215", 5),
      j("151x260", 6),
      j("151x260", 4, { visuel: "GAIA 150x255 BRILLANT.pdf" }),
      j("126x260", 2, { teinteMasse: true, visuel: "NOIR ZERO MAT" }),
    ]);
    assert.equal(t.ex, 17);
    assert.equal(t.stock, 0);
    assert.deepEqual(
      t.formats.map((f) => [f.plaque, f.ex, f.mat, f.brillant]),
      [
        ["151x260", 10, 6, 4],
        ["126x260", 2, 2, 0],
        ["101x215", 5, 5, 0],
      ],
    );
  });

  it("stock : dans le total, hors détail par plaque", () => {
    const t = totalEx([j("151x260", 6), j("151x260", 3, { useStock: true })]);
    assert.equal(t.ex, 9);
    assert.equal(t.stock, 3);
    assert.deepEqual(
      t.formats.map((f) => f.ex),
      [6],
    );
  });

  it("ex absent ou invalide compté 0 ; liste vide", () => {
    assert.equal(totalEx([j("151x260", undefined), j("151x260", "x")]).ex, 0);
    assert.deepEqual(totalEx([]), { ex: 0, stock: 0, formats: [] });
  });

  it("ligneFormat", () => {
    assert.equal(ligneFormat({ ex: 10, mat: 6, brillant: 4 }), "10 ex. — Mat 6 · Brillant 4");
    assert.equal(ligneFormat({ ex: 5, mat: 5, brillant: 0 }), "5 ex. — Mat");
    assert.equal(ligneFormat({ ex: 4, mat: 0, brillant: 4 }), "4 ex. — Brillant");
  });
});
