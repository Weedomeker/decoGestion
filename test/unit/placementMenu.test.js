const assert = require("node:assert/strict");
const { placerMenu } = require("../../client/src/utils/placementMenu.js");

const fenetre = { largeur: 1280, hauteur: 600 };
const decl = (top, left = 100, width = 200) => ({ top, bottom: top + 28, left, right: left + width, width });

describe("placerMenu : menu déroulant posé au-dessus de la page", () => {
  it("s'ouvre vers le bas quand il y a la place", () => {
    const p = placerMenu({ declencheur: decl(100), fenetre, hauteurContenu: 250 });
    assert.equal(p.versLeHaut, false);
    assert.equal(p.top, 128);
    assert.equal(p.hauteurMax, 250);
  });

  it("s'ouvre vers le haut près du bas de la fenêtre", () => {
    const p = placerMenu({ declencheur: decl(520), fenetre, hauteurContenu: 250 });
    assert.equal(p.versLeHaut, true);
    assert.equal(p.top, 520 - 250);
    assert.equal(p.hauteurMax, 250);
  });

  it("plafonne la hauteur à la place disponible, sans descendre sous hauteurMin", () => {
    const p = placerMenu({ declencheur: decl(300), fenetre: { largeur: 1280, hauteur: 420 }, hauteurContenu: 300 });
    assert.ok(p.hauteurMax <= 300 - 8 && p.hauteurMax >= 120, `hauteurMax = ${p.hauteurMax}`);
  });

  it("prend au moins la largeur du déclencheur", () => {
    assert.equal(placerMenu({ declencheur: decl(100), fenetre, hauteurContenu: 100 }).minLargeur, 200);
  });

  it("recale à gauche un menu qui dépasserait le bord droit", () => {
    const p = placerMenu({ declencheur: decl(100, 1200, 200), fenetre, hauteurContenu: 100 });
    assert.ok(p.left + p.minLargeur <= 1280 - 8, `left = ${p.left}`);
  });

  it("plafonne la largeur pour que des libellés longs ne débordent pas à droite", () => {
    const p = placerMenu({ declencheur: decl(100, 900, 300), fenetre, hauteurContenu: 100 });
    assert.equal(p.left, 900);
    assert.equal(p.maxLargeur, 1280 - 8 - 900);
  });

  it("ne s'étire pas au-delà de 480 px, ou de la largeur du champ s'il est plus large", () => {
    assert.equal(placerMenu({ declencheur: decl(100, 100, 200), fenetre, hauteurContenu: 100 }).maxLargeur, 480);
    assert.equal(placerMenu({ declencheur: decl(100, 100, 600), fenetre, hauteurContenu: 100 }).maxLargeur, 600);
  });

  it("limite la largeur à la fenêtre moins 16 px", () => {
    const p = placerMenu({ declencheur: decl(100, 0, 2000), fenetre, hauteurContenu: 100 });
    assert.equal(p.minLargeur, 1280 - 16);
    assert.equal(p.left, 8);
  });
});
