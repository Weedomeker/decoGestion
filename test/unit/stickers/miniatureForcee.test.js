const { expect } = require("chai");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chercherApercus, lireMiniatureForcee, TAILLE_MAX } = require("../../../server/src/stickers/miniatureForcee");
const { renderSticker } = require("../../../server/src/stickers/renderSticker");

const LOGO = path.join(__dirname, "../../../server/public/images/stickers/logo_deco.png");
const FICHIERS = [
  "5 GALETS 100x210 94922870 MAT.jpg",
  "5 GALETS 125x210 94956912 MAT.jpg",
  "JARDIN SECRET GAUCHE 80x210 94953676.jpg",
  "notes.txt",
];

describe("stickers/miniatureForcee", () => {
  describe("chercherApercus", () => {
    it("garde les JPG dont le nom contient tous les mots, sans tenir compte de la casse", () => {
      expect(chercherApercus(FICHIERS, "galets 100X210")).to.deep.equal(["5 GALETS 100x210 94922870 MAT.jpg"]);
      expect(chercherApercus(FICHIERS, "galets")).to.have.length(2);
    });
    it("ignore une recherche trop courte et les fichiers non JPG", () => {
      expect(chercherApercus(FICHIERS, "a")).to.deep.equal([]);
      expect(chercherApercus(FICHIERS, "notes")).to.deep.equal([]);
    });
  });

  describe("lireMiniatureForcee", () => {
    let dossier;
    before(() => {
      dossier = fs.mkdtempSync(path.join(os.tmpdir(), "apercus-"));
      fs.writeFileSync(path.join(dossier, "A 100x210.jpg"), "x");
    });
    after(() => fs.rmSync(dossier, { recursive: true, force: true }));

    it("rien d'imposé : null (miniature trouvée par la référence)", () => {
      expect(lireMiniatureForcee({}, dossier)).to.equal(null);
    });
    it("aperçu choisi : chemin dans le dossier des aperçus", () => {
      expect(lireMiniatureForcee({ apercu: "A 100x210.jpg" }, dossier).chemin).to.equal(path.join(dossier, "A 100x210.jpg"));
    });
    it("refuse un chemin venu du navigateur ou un aperçu absent", () => {
      expect(() => lireMiniatureForcee({ apercu: "../server.js" }, dossier)).to.throw(/invalide/);
      expect(() => lireMiniatureForcee({ apercu: "..\\x.jpg" }, dossier)).to.throw();
      expect(() => lireMiniatureForcee({ apercu: "B.jpg" }, dossier)).to.throw(/introuvable/);
    });
    it("fichier importé : PNG/JPG accepté, autre format ou > 5 Mo refusé", () => {
      const png = fs.readFileSync(LOGO);
      expect(lireMiniatureForcee({ miniatureDataUrl: `data:image/png;base64,${png.toString("base64")}` }).data.equals(png)).to.equal(true);
      expect(() => lireMiniatureForcee({ miniatureDataUrl: "data:image/gif;base64,R0lG" })).to.throw(/PNG ou JPG/);
      const gros = Buffer.alloc(TAILLE_MAX + 1).toString("base64");
      expect(() => lireMiniatureForcee({ miniatureDataUrl: `data:image/png;base64,${gros}` })).to.throw(/5 Mo/);
    });
  });

  it("renderSticker dessine une miniature importée (PNG en mémoire)", async () => {
    const elements = [{ type: "miniature", x: 5, y: 50, l: 95, h: 31.5, orientationImage: -90 }];
    const sans = await renderSticker(elements, {});
    const avec = await renderSticker(elements, { miniatureData: fs.readFileSync(LOGO) });
    expect(avec.length).to.be.greaterThan(sans.length + 1000);
  });
});
