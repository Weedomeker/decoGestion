const { expect } = require("chai");
const { baseFichierSurMesure, formatReel } = require("../../server/src/surMesure/nomFichier");

const panneau = (extra = {}) => ({
  page: 0,
  nom: "169580-1 LM AMIENS JardinSecret H210cm MAT",
  largeur: 800,
  hauteur: 2100,
  deco: "JARDIN SECRET",
  vernis: "MAT",
  ...extra,
});
const base = (p, extra = {}) =>
  baseFichierSurMesure({ cmd: "169580", client: "LM", ville: "Amiens", panneau: p, orientation: "GAUCHE", ...extra });

describe("surMesure/nomFichier", () => {
  it("suit la forme des autres jobs, avec le format fini réel", () => {
    expect(base(panneau())).to.equal("169580 - LM AMIENS - 80x210 - JARDIN SECRET GAUCHE MAT");
  });

  it("écrit les formats décimaux avec une virgule", () => {
    expect(formatReel({ largeur: 605, hauteur: 2000 })).to.equal("60,5x200");
  });

  it("numérote un panneau sans orientation pour le distinguer", () => {
    const p = panneau({ nom: "169694-2 ECOM MONROCQ", largeur: 1000, hauteur: 2100 });
    expect(base(p, { orientation: null })).to.equal("169580 - LM AMIENS - 100x210 - JARDIN SECRET MAT 2");
  });

  it("ne numérote pas un PDF d'une seule page", () => {
    const p = panneau({ nom: "169669 LM ST BRIEUC PALMERAIE" });
    expect(base(p, { orientation: null })).to.equal("169580 - LM AMIENS - 80x210 - JARDIN SECRET MAT");
  });

  it("distingue deux panneaux identiques de la file, sinon le second écraserait le premier", () => {
    const premier = base(panneau({ nom: "168917-2 LM X", page: 1 }), { orientation: "CENTRE" });
    const second = base(panneau({ nom: "168917-3 LM X", page: 2 }), {
      orientation: "CENTRE",
      jobs: [{ smBase: premier, smPage: 1 }],
    });
    expect(second).to.equal(`${premier} 3`);
  });

  it("garde le même nom quand le même panneau est ajouté deux fois", () => {
    const premier = base(panneau());
    expect(base(panneau(), { jobs: [{ smBase: premier, smPage: 0 }] })).to.equal(premier);
  });

  it("retire les caractères interdits dans un nom de fichier", () => {
    expect(base(panneau({ deco: "A/B" }))).to.include("A B GAUCHE");
  });

  it("se passe de ville et d'orientation absentes", () => {
    const p = panneau({ nom: "169669 LM X" });
    expect(base(p, { ville: "", orientation: "" })).to.equal("169580 - LM 80x210 - JARDIN SECRET MAT");
  });
});
