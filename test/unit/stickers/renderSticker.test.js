const { expect } = require("chai");
const { PDFDocument } = require("pdf-lib");
const { renderSticker, normaliserElements, cheminBandes, tailleAjustee } = require("../../../server/src/stickers/renderSticker");
const { elementsStandard } = require("../../../server/src/stickers/modelesParDefaut");

describe("stickers/renderSticker", () => {
  it("produit une page A6, comme l'ancienne notice (4 par A4)", async () => {
    const bytes = await renderSticker(elementsStandard("#EC2027", "deco", "absent"), { numEx: "1 01/01", infos: "X" });
    const doc = await PDFDocument.load(bytes);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).to.be.closeTo(297.6, 0.2);
    expect(height).to.be.closeTo(419.5, 0.2);
  });

  it("ignore une image absente ou une miniature introuvable sans échouer", async () => {
    const elements = [
      { type: "image", imageId: "abc", x: 0, y: 0, l: 10, h: 10 },
      { type: "miniature", x: 0, y: 20, l: 10, h: 10 },
    ];
    const bytes = await renderSticker(elements, { miniaturePath: "C:/inexistant.jpg" }, { chargerImage: async () => null });
    expect(bytes.length).to.be.greaterThan(100);
  });

  it("supporte les caractères hors WinAnsi (retirés) et la rotation", async () => {
    const bytes = await renderSticker([{ type: "texte", contenu: "Flèche → ✓ ok", x: 5, y: 5, l: 50, h: 10, rotation: 90 }], {});
    expect(bytes.length).to.be.greaterThan(100);
  });

  it("normaliserElements : types inconnus retirés, valeurs bornées", () => {
    const [e, ...reste] = normaliserElements([
      { type: "texte", x: "12", y: 1e9, taille: 999, couleur: "rouge", align: "bizarre" },
      { type: "script", contenu: "x" },
    ]);
    expect(reste).to.have.length(0);
    expect(e).to.include({ x: 12, y: 296, taille: 120, couleur: "#000000", align: "center", police: "bold" });
  });

  it("tailleAjustee : réduit la taille pour tenir dans la largeur", () => {
    const mesurer = (l, t) => l.length * t * 0.5;
    expect(tailleAjustee(["abcd"], mesurer, 10, 100)).to.equal(10);
    expect(tailleAjustee(["a".repeat(40)], mesurer, 10, 100)).to.equal(5);
  });

  it("cheminBandes : bandes découpées dans le cadre", () => {
    const d = cheminBandes({ x: 0, y: 0, l: 10, h: 2, periode: 2.5, largeurBande: 1.2 });
    const nombres = d.match(/-?\d+\.\d+/g).map(Number);
    const xs = nombres.filter((_, i) => i % 2 === 0);
    const ys = nombres.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).to.be.at.least(0);
    expect(Math.max(...xs)).to.be.at.most(10);
    expect(Math.min(...ys)).to.be.at.least(0);
    expect(Math.max(...ys)).to.be.at.most(2);
  });
});
