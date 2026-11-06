const { expect } = require("chai");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { trouverPdfSession, moisRecherches, dansDossier } = require("../../server/src/surMesure/sessionPdf");

describe("surMesure/sessionPdf", () => {
  let racine;
  const ecrire = (dossier, nom) => {
    fs.mkdirSync(path.join(racine, dossier), { recursive: true });
    fs.writeFileSync(path.join(racine, dossier, nom), "x");
  };

  beforeEach(() => {
    racine = fs.mkdtempSync(path.join(os.tmpdir(), "sm-"));
  });
  afterEach(() => fs.rmSync(racine, { recursive: true, force: true }));

  const NOV = new Date(2026, 10, 5);

  it("cherche le mois courant et le précédent, y compris à cheval sur l'année", () => {
    expect(moisRecherches(NOV)).to.deep.equal(["2026-11", "2026-10"]);
    expect(moisRecherches(new Date(2026, 0, 15))).to.deep.equal(["2026-01", "2025-12"]);
  });

  it("trouve le PDF d'une commande dans le dossier du mois", async () => {
    ecrire("2026-11 NOVEMBRE", "169580 LM AMIENS JardinSecret H210cm(3)MAT.pdf");
    ecrire("2026-11 NOVEMBRE", "169580 LM AMIENS JardinSecret H210cm(3)MAT BAT.png");
    ecrire("2026-10 OCTOBRE", "169580 LM AMIENS ancien.pdf");
    ecrire("2026-09 SEPTEMBRE", "169580 LM AMIENS trop vieux.pdf");
    const noms = (await trouverPdfSession(racine, "169580", NOV)).map((p) => p.nom).sort();
    expect(noms).to.deep.equal(["169580 LM AMIENS JardinSecret H210cm(3)MAT.pdf", "169580 LM AMIENS ancien.pdf"]);
  });

  it("ignore les BAT en PDF, les autres commandes et les numéros plus longs", async () => {
    ecrire("2026-11 NOVEMBRE", "169580 LM AMIENS BAT.pdf");
    ecrire("2026-11 NOVEMBRE", "1695801 LM AUTRE.pdf");
    ecrire("2026-11 NOVEMBRE", "169581 LM AUTRE.pdf");
    expect(await trouverPdfSession(racine, "169580", NOV)).to.deep.equal([]);
  });

  it("garde le début d'un chemin réseau", () => {
    expect(dansDossier(String.raw`\\NAS\agence\ SESSIONS`, "a.pdf")).to.equal("//NAS/agence/ SESSIONS/a.pdf");
    expect(dansDossier("//NAS/agence/", "a.pdf")).to.equal("//NAS/agence/a.pdf");
  });

  it("accepte un chemin qui vise directement un dossier de PDF", async () => {
    ecrire(".", "169580 LM AMIENS.PDF");
    const [pdf] = await trouverPdfSession(racine, "169580", NOV);
    expect(pdf.nom).to.equal("169580 LM AMIENS.PDF");
    expect(pdf.chemin).to.not.include("\\");
  });
});
