const assert = require("node:assert/strict");
const { resumeSelection } = require("../../client/src/utils/resumeSelection.js");

const jobs = [
  { id: "a", dossierNumero: "1", prix: 100, surMesure: false },
  { id: "b", dossierNumero: "1", prix: 50, surMesure: true },
  { id: "c", dossierNumero: "2", prix: 25, surMesure: true },
  { id: "d", dossierNumero: "2", prix: 10, _absorbedBy: "c" },
];
const tous = () => true;

describe("resumeSelection : résumé du bandeau Ajouter", () => {
  it("compte sélection, total, dossiers et montant", () => {
    assert.deepEqual(resumeSelection(jobs, new Set(["a", "c"]), tous), {
      selectionnes: 2,
      total: 3,
      dossiers: 2,
      montant: 125,
    });
  });

  it("respecte le filtre sur-mesure", () => {
    assert.deepEqual(resumeSelection(jobs, new Set(["a", "b", "c"]), (j) => j.surMesure), {
      selectionnes: 2,
      total: 2,
      dossiers: 2,
      montant: 75,
    });
  });

  it("ne compte pas les profils/kits comme des jobs", () => {
    const avecPk = [...jobs, { id: "pk", dossierNumero: "3", prix: 40, type: "profils_kits" }];
    assert.deepEqual(resumeSelection(avecPk, new Set(["a", "pk"]), tous), {
      selectionnes: 1,
      total: 3,
      dossiers: 1,
      montant: 100,
    });
  });

  it("ignore les jobs absorbés et les prix absents", () => {
    assert.deepEqual(resumeSelection([{ id: "x", dossierNumero: "9" }], new Set(["x"]), tous), {
      selectionnes: 1,
      total: 1,
      dossiers: 1,
      montant: 0,
    });
  });
});
