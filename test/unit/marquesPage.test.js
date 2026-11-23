const { expect } = require("chai");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const { lireMarque, marqueDePage, texteDePage } = require("../../server/src/surMesure/marquesPage");

describe("surMesure/marquesPage — repères en marge des PDF des créa", () => {
  it("lit l'orientation et le rang, sous toutes les formes relevées", () => {
    expect(lireMarque("GAUCHE 1/3")).to.include({ orientation: "GAUCHE", rang: 1, total: 3 });
    expect(lireMarque("HAUT-DROIT")).to.include({ orientation: "DROIT", rang: null, total: null });
    expect(lireMarque("HAUT 2/4")).to.include({ orientation: null, rang: 2, total: 4 });
    expect(lireMarque("1/3 L 255 cm")).to.include({ orientation: null, rang: 1, total: 3 });
    expect(lireMarque("droite")).to.include({ orientation: "DROIT" });
    expect(lireMarque("")).to.include({ orientation: null, rang: null });
  });

  it("ne tranche pas quand une page porte deux orientations ou deux rangs", () => {
    expect(lireMarque("GAUCHE 1/3 CENTRE 2/3")).to.include({ orientation: null, rang: null });
  });

  it("ne prend pas une date ou un mot contenant DROIT", () => {
    expect(lireMarque("12/11/2026 ADROITEMENT")).to.include({ orientation: null, rang: null });
  });

  it("ne garde que le texte placé dans la page, pas celui des plans de travail voisins", async () => {
    const doc = await PDFDocument.create();
    const police = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([500, 800]);
    page.drawText("CENTRE 2/3", { x: 14, y: 790, size: 8, font: police });
    page.drawText("GAUCHE 1/3", { x: -480, y: 790, size: 8, font: police }); // page précédente
    page.drawText("DROIT 3/3", { x: 501, y: 790, size: 8, font: police }); // juste après le bord
    const relu = await PDFDocument.load(await doc.save());
    expect(texteDePage(relu, 0)).to.equal("CENTRE 2/3");
    expect(marqueDePage(relu, 0)).to.include({ orientation: "CENTRE", rang: 2, total: 3 });
  });

  it("lit le texte d'un Form XObject, à sa position dans la page", async () => {
    const source = await PDFDocument.create();
    const police = await source.embedFont(StandardFonts.Helvetica);
    source.addPage([300, 300]).drawText("DROIT 2/2", { x: 10, y: 10, size: 8, font: police });
    const doc = await PDFDocument.create();
    const [forme] = await doc.embedPdf(await source.save());
    doc.addPage([400, 400]).drawPage(forme, { x: 50, y: 50 });
    const horsPage = doc.addPage([400, 400]);
    horsPage.drawPage(forme, { x: 395, y: 50 }); // texte à x = 405 : hors page
    const relu = await PDFDocument.load(await doc.save());
    expect(marqueDePage(relu, 0)).to.include({ orientation: "DROIT", rang: 2, total: 2 });
    expect(marqueDePage(relu, 1)).to.include({ orientation: null, rang: null });
  });

  it("une page sans texte n'a pas de repère", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const relu = await PDFDocument.load(await doc.save());
    expect(marqueDePage(relu, 0)).to.include({ orientation: null, rang: null, texte: "" });
  });
});
