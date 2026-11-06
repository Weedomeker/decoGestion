const { expect } = require("chai");
const { PDFDocument } = require("pdf-lib");
const {
  chargerSource,
  lirePanneau,
  lirePanneaux,
  pdfImpose,
  positionLibelle,
  hauteurDansNom,
  decouperNom,
  nommer,
  texteQr,
  choisirPlaque,
  imposer,
  scriptCut,
} = require("../../server/src/surMesure/imposition");

const MM = 72 / 25.4;
const NOM = "169063 LM STE GENEVIEVE MarbreNerf H210cm(5)BRILLANT";

async function pdfDePages(pages, echelle = 1) {
  const doc = await PDFDocument.create();
  for (const [l, h] of pages) {
    const page = doc.addPage([((l + 10) * MM) / echelle, ((h + 10) * MM) / echelle]);
    page.setTrimBox((5 * MM) / echelle, (5 * MM) / echelle, (l * MM) / echelle, (h * MM) / echelle);
    page.drawRectangle({ x: 0, y: 0, width: 10, height: 10 });
  }
  return chargerSource(await doc.save());
}

describe("surMesure/imposition", () => {
  it("lit la hauteur dans le nom", () => {
    expect(hauteurDansNom(NOM)).to.equal(2100);
    expect(hauteurDansNom("169076 - LM AGEN 105,5x255 CARRELAGE")).to.equal(2550);
    expect(hauteurDansNom("sans dimension")).to.equal(null);
  });

  it("sépare la finition et retire le nombre de panneaux", () => {
    expect(decouperNom(NOM)).to.deep.equal({ base: "169063 LM STE GENEVIEVE MarbreNerf H210cm", finition: "BRILLANT" });
    expect(decouperNom("169011 LM VALENCIENNES Gaia L85xH195cm(2)+BLANC MAT").finition).to.equal("+BLANC MAT");
  });

  it("nettoie les noms ECOM à tirets bas", () => {
    expect(decouperNom("169694 ECOM MONROCQ_Gavure nature_70x180+80x180cm_MAT(2)")).to.deep.equal({
      base: "169694 ECOM MONROCQ_Gavure nature_70x180+80x180cm",
      finition: "MAT",
    });
    expect(decouperNom("168364 ECOM FRANCOISE _Jardin Japonais_H230cm_(3) MAT")).to.deep.equal({
      base: "168364 ECOM FRANCOISE _Jardin Japonais_H230cm",
      finition: "MAT",
    });
    expect(decouperNom("168532 ECOM ESNAULT_Travertino_H250cm_MAT (3)").finition).to.equal("MAT");
  });

  it("ne prend pas la fin d'un mot pour une finition", () => {
    expect(decouperNom("169000 LM NANTES CHROMAT").finition).to.equal("");
  });

  it("garde le numéro de panneau collé à la commande malgré un tiret dans le nom", () => {
    expect(nommer(decouperNom("169076 - LM AGEN 105,5x255 CARRELAGE"), 1, 3)).to.equal(
      "169076-2 LM AGEN 105,5x255 CARRELAGE",
    );
  });

  it("numérote les panneaux de gauche à droite", () => {
    const p = decouperNom("168917 LM BEZIERS Onyx H240cm(4)");
    const noms = [0, 1, 2, 3].map((i) => nommer(p, i, 4).toUpperCase());
    expect(noms).to.deep.equal([
      "168917-1 LM BEZIERS ONYX H240CM",
      "168917-2 LM BEZIERS ONYX H240CM",
      "168917-3 LM BEZIERS ONYX H240CM",
      "168917-4 LM BEZIERS ONYX H240CM",
    ]);
    expect(nommer(p, 0, 1)).to.equal("168917 LM BEZIERS Onyx H240cm");
    expect(new Set(noms.map(texteQr)).size).to.equal(4);
  });

  it("compose le QR : 24 caractères et T, 21 modules en majuscules, 25 sinon", () => {
    expect(texteQr("169063 LM STE GENEVIEVE MarbreNerf")).to.equal("169063 LM STE GENEVIEVE T");
    expect(imposer(882, 2100, "169063 LM STE GENEVIEVE MarbreNerf").cote).to.equal(16.8);
    expect(imposer(1488, 2400, "168917 LM BEZIERS Onyx H240cm").cote).to.equal(20);
  });

  it("choisit la plus petite plaque observée", () => {
    expect(choisirPlaque(1000, 2100)).to.deep.equal([2150, 1010]);
    expect(choisirPlaque(1250, 2100)).to.deep.equal([2600, 1260]);
    expect(choisirPlaque(1000, 2400)).to.deep.equal([2600, 1260]);
    expect(choisirPlaque(1491, 2400)).to.deep.equal([2600, 1510]);
    expect(choisirPlaque(1000, 1500)).to.deep.equal([1600, 1010]);
    expect(choisirPlaque(1000, 3000)).to.deep.equal([3050, 1500]);
    expect(() => choisirPlaque(1000, 3500)).to.throw(/choisissez une plaque/);
    expect(() => choisirPlaque(2000, 1000)).to.throw(/plus large que haut/);
  });

  it("décrit un panneau pleine largeur avec repères sur les petits côtés", () => {
    const g = imposer(1000, 2100, "169063 LM 5TE GENEVIEVE MarbreNerf");
    expect(g.reperes[0]).to.deep.equal([12, 8]);
    expect(g.offset).to.deep.equal([-17.8, -97.5]);
    expect(g.chutes).to.have.length(2);
    expect(scriptCut(g)).to.match(/MoveTo 25\.0,5\.0,Closed,Cut/);
  });

  it("applique les règles de l'historique selon les marges", () => {
    const g = imposer(1000, 2400, "168917 LM 3EZIERS ONYX H240CM CENTRE B");
    expect(g.reperes[0]).to.deep.equal([87, 133]);
    expect(g.offset[1]).to.equal(-102.5);
    expect(g.chutes).to.have.length(2);
    const h = imposer(882, 2100, "169063 LM STE GENEVIEVE MARBRENERF");
    expect(h.offset).to.deep.equal([-106.8, -7.5]);
    expect(h.chutes).to.have.length(6);
  });

  it("produit le .cut et le PDF en mémoire", async () => {
    const source = await pdfDePages([
      [882, 2100],
      [769, 2100],
    ]);
    const plaques = lirePanneaux(source, "169999 LM ESSAI Decor H210cm(2)MAT");
    expect(plaques.map((p) => [p.nom, p.largeur, p.hauteur])).to.deep.equal([
      ["169999-1 LM ESSAI Decor H210cm MAT", 882, 2100],
      ["169999-2 LM ESSAI Decor H210cm MAT", 769, 2100],
    ]);
    expect(scriptCut(plaques[0])).to.match(/^MGE i-cut script/);
    const impose = await PDFDocument.load(await pdfImpose(source, plaques[0]));
    const { width, height } = impose.getPage(0).getSize();
    expect([Math.round(width / MM), Math.round(height / MM)]).to.deep.equal([2150, 1010]);
  });

  const longueur = () => 400;

  it("imprime le nom sous le panneau quand il y a la place", () => {
    const g = imposer(800, 2100, "169580-1 LM AMIENS");
    expect(positionLibelle(g, longueur)).to.deep.equal({ x: 148.2, y: 5.3, corps: 50, rotation: 0 });
  });

  it("imprime le nom d'un panneau pleine largeur sur le petit côté, centré", () => {
    const g = imposer(1000, 2100, "169548-2 LM LE MANS");
    expect(positionLibelle(g, longueur)).to.deep.equal({ x: 15, y: 305, corps: 35, rotation: 90 });
  });

  it("garde ce nom à l'écart des repères et du QR", () => {
    const g = imposer(1000, 2100, "169548-2 LM LE MANS");
    const { y } = positionLibelle(g, longueur);
    const fin = y + 400;
    g.reperes.filter(([x]) => x < 25).forEach(([, ry]) => expect(ry < y - 3 || ry > fin + 3).to.equal(true));
    expect(g.posQr[1] + g.cote).to.be.below(y);
  });

  it("imprime le libellé demandé sans toucher au nom du QR et du .cut", async () => {
    const source = await pdfDePages([[1000, 2100]]);
    const g = lirePanneau(source, "169548 LM LE MANS H210cm MAT", 0);
    const libelle = "169548 - LM MULSANNE - 100x210 - ONYX CENTRE 1_EX";
    const impose = await PDFDocument.load(await pdfImpose(source, g, libelle));
    expect(impose.getPageCount()).to.equal(1);
    expect(g.nom).to.equal("169548 LM LE MANS H210cm MAT");
    expect(texteQr(g.nom)).to.equal("169548 LM LE MANS H210cmT");
  });

  it("déduit l'échelle 1/10 du nom, sinon de la hauteur Gamesys", async () => {
    const source = await pdfDePages([[1000, 2100]], 10);
    expect(lirePanneau(source, "169999 LM ESSAI H210cm MAT", 0).echelle).to.equal(10);
    const g = lirePanneau(source, "169999 LM ESSAI MAT", 0, { hauteurAttendue: 2100 });
    expect([g.echelle, g.largeur, g.hauteur]).to.deep.equal([10, 1000, 2100]);
  });

  it("demande l'échelle plutôt que de supposer sur une page trop petite", async () => {
    const source = await pdfDePages([[1000, 2100]], 10);
    expect(() => lirePanneau(source, "169999 LM ESSAI MAT", 0)).to.throw(/échelle à préciser/);
  });

  it("force une plaque par page", async () => {
    const source = await pdfDePages([
      [800, 2100],
      [1200, 2100],
    ]);
    const [a, b] = lirePanneaux(source, "169999 LM ESSAI H210cm(2)MAT", {
      plaques: [
        [2150, 1010],
        [2600, 1260],
      ],
    });
    expect([a.plaque, b.plaque]).to.deep.equal([
      [2150, 1010],
      [2600, 1260],
    ]);
  });
});
