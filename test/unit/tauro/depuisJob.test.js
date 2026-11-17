const assert = require("node:assert/strict");
const { ligneDepuisJob } = require("../../../server/src/tauro/depuisJob");
const regles = require("../../../server/src/tauro/regles-tauro");
const L = require("../../../server/src/tauro/lancement-tauro");

const base = {
  _id: "abc",
  cmd: 169034,
  client: "LM",
  ville: "Amiens",
  sousDossier: "01",
  format_visu: "150x255",
  format_Plaque: "Deco_Std_151x260",
  visuel: "BETON CLAIR 150x255 MAT.pdf",
  visuPath: "C:/v/BETON CLAIR 150x255 MAT.pdf",
  ex: 2,
};

describe("tauro/depuisJob", () => {
  it("job standard", () => {
    const l = ligneDepuisJob(base);
    assert.equal(l.cle, "169034/01");
    assert.deepEqual(l.clesJournal, ["169034/01"]);
    assert.equal(l.nomOrigine, "169034 - LM AMIENS - 151x260 - BETON CLAIR 150x255 MAT 2_EX");
    assert.equal(l.sansPdf, false);
  });

  it("crédence 2 visuels, 2 commandes", () => {
    const l = ligneDepuisJob({
      ...base,
      client: "CASTO",
      format_visu: "300x60",
      format_Plaque: "Deco_Std_150x305",
      ex: 1,
      visuel: "CRED 300x60cm MOSAIQUE 3664711694254 MAT.pdf",
      visuel2: "VELTIS BRILLANT 255x60 VELTIS-25560.pdf",
      visuPath2: "x",
      cmd2: 169380,
      sousDossier2: "02",
    });
    const nom = regles.job(l, "S1711A").job;
    assert.ok(nom.includes("_169034+169380_"), nom);
    assert.ok(nom.includes("ET"), nom);
    assert.deepEqual(l.clesJournal, ["169034/01", "169380/02"]);
  });

  it("sur-mesure : une clé par page", () => {
    const sm = {
      ...base,
      ex: 1,
      smBase: "169034 - LM AMIENS - 80x210 - JARDIN SECRET GAUCHE MAT",
      smFormat: "80x210",
    };
    const a = ligneDepuisJob({ ...sm, _id: "a", smPage: 1 });
    const b = ligneDepuisJob({ ...sm, _id: "b", smPage: 2 });
    assert.equal(a.cle, "169034/01-p1");
    assert.equal(b.cle, "169034/01-p2");
    assert.equal(a.deco, "JARDIN SECRET GAUCHE");
    assert.equal(a.fmtVis, "80x210");
    const plan = L.preparerLancement([a, b], { date: "2026-11-17" });
    assert.equal(plan.bloques.length, 0);
  });

  it("cmd 0 ou sous-dossier vide : clé par id", () => {
    assert.equal(ligneDepuisJob({ ...base, cmd: 0 }).cle, "id:abc");
    assert.equal(ligneDepuisJob({ ...base, sousDossier: undefined }).cle, "id:abc");
  });

  it("teinte masse et stock : sansPdf", () => {
    assert.equal(ligneDepuisJob({ ...base, teinteMasse: true, format_visu: "BLANC_150x255" }).sansPdf, true);
    assert.equal(ligneDepuisJob({ ...base, useStock: true }).sansPdf, true);
  });

  it("job fusionné", () => {
    const l = ligneDepuisJob({ ...base, sousDossiers: ["01", "02"] });
    assert.deepEqual(l.clesJournal, ["169034/01", "169034/02"]);
    assert.equal(l.clesJournal[0], l.cle);
  });
});
