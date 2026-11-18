const assert = require("node:assert/strict");
const { resumeDossiers } = require("../../client/src/utils/resumeDossiers.js");

describe("resumeDossiers : résumé de la zone de recherche", () => {
  it("compte dossiers, jobs hors profils/kits et montant", () => {
    const r = resumeDossiers([
      { numero: "1", prixTotal: 100.5, jobs: [{ type: "deco" }, { type: "profils_kits" }] },
      { numero: "2", prixTotal: 50, jobs: [{ type: "deco" }, { type: "deco" }] },
    ]);
    assert.deepEqual(r, { nbDossiers: 2, nbJobs: 3, montant: 150.5 });
  });

  it("dossier seulement profils/kits : 0 job, sans planter", () => {
    assert.deepEqual(resumeDossiers([{ numero: "3", jobs: [{ type: "profils_kits" }] }]), {
      nbDossiers: 1,
      nbJobs: 0,
      montant: 0,
    });
  });

  it("ne compte pas les 2es panneaux absorbés (même décompte que le bandeau)", () => {
    const r = resumeDossiers([{ numero: "4", jobs: [{ id: "a" }, { id: "b", _absorbedBy: "a" }] }]);
    assert.equal(r.nbJobs, 1);
  });

  it("liste vide", () => {
    assert.deepEqual(resumeDossiers([]), { nbDossiers: 0, nbJobs: 0, montant: 0 });
  });
});
