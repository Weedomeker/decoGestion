const assert = require("node:assert/strict");
const { nomsJob } = require("../../server/src/utils/nomsJob");
const { castoName } = require("../../server/src/utils/jobNames");

const base = {
  cmd: 169034,
  client: "LM",
  ville: "Amiens",
  format_visu: "150x255",
  format_Plaque: "Deco_Std_151x260",
  visuel: "BETON CLAIR 150x255 MAT.pdf",
  ex: 4,
};

describe("nomsJob", () => {
  it("job standard", () => {
    const r = nomsJob(base);
    assert.equal(r.fileName, "169034 - LM AMIENS - 151x260 - BETON CLAIR 150x255 MAT 4_EX");
    assert.equal(r.pdfBaseName, `${r.fileName}.pdf`);
    assert.equal(r.fileName2, "");
  });

  const cred = {
    cmd: 169034,
    cmd2: 0,
    client: "CASTO",
    ville: "Lille",
    format_visu: "300x60",
    format_Plaque: "Deco_Std_150x305",
    visuel: "CRED 300x60cm MOSAIQUE 3664711694254 MAT.pdf",
    visuel2: "CRED 300x60cm MOSAIQUE 3664711694254 MAT.pdf",
    visuPath2: "x",
    ex: 1,
  };

  it("crédence cmd2 = 0", () => {
    const r = nomsJob(cred);
    assert.equal(r.fileName2, "CASTO LILLE - 150x305 - CRED 300x60cm MOSAIQUE 3664711694254 MAT 1_EX");
    assert.equal(r.pdfBaseName, `${castoName(r.fileName)} + ${castoName(r.fileName2)}.pdf`);
  });

  it("crédence cmd2 renseigné", () => {
    const r = nomsJob({ ...cred, cmd2: 169380 });
    assert.ok(r.fileName2.startsWith("169380 - CASTO LILLE"));
  });

  it("crédence sans visuPath2", () => {
    const r = nomsJob({ ...cred, visuPath2: undefined });
    assert.equal(r.pdfBaseName, `${castoName(r.fileName)}.pdf`);
  });

  it("sur-mesure", () => {
    const r = nomsJob({ ...base, smBase: "169580 - LM AMIENS - 80x210 - JARDIN SECRET GAUCHE MAT", ex: 1 });
    assert.equal(r.fileName, "169580 - LM AMIENS - 80x210 - JARDIN SECRET GAUCHE MAT 1_EX");
    assert.equal(r.pdfBaseName, `${r.fileName}.pdf`);
  });

  it("teinte masse et stock : pas de PDF", () => {
    const t = nomsJob({ ...base, teinteMasse: true, format_visu: "BLANC_150x255" });
    assert.equal(t.fileName, "169034 - LM AMIENS - 150x255 - BETON CLAIR 150x255 MAT 4_EX");
    assert.equal(t.pdfBaseName, "");
    assert.equal(nomsJob({ ...base, useStock: true }).pdfBaseName, "");
  });
});
