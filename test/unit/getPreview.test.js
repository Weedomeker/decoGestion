const { expect } = require("chai");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Jimp = require("jimp");
const getPreview = require("../../server/src/getPreview");
const { findPreviewFile } = getPreview;

describe("getPreview — recherche et copie des aperçus", () => {
  describe("findPreviewFile", () => {
    const files = [
      "TERRAZZO 150x210 TRZ-150210 BRILLANT.jpg",
      "TERRAZZO 150x210 TRZ-150210.jpg",
      "MOSAÏQUE CARRELÉE 3664711694254 300x60.jpg",
    ];

    it("ref unique : renvoie le seul aperçu correspondant", () => {
      expect(findPreviewFile("3664711694254", "CRED 300x60cm MOSAIQUE 3664711694254 MAT.pdf", files)).to.equal(
        "MOSAÏQUE CARRELÉE 3664711694254 300x60.jpg",
      );
    });

    it("ref partagée : préfère l'aperçu sans mot absent du nom du visuel", () => {
      expect(findPreviewFile("TRZ-150210", "TERRAZZO 150x210 TRZ-150210.pdf", files)).to.equal(
        "TERRAZZO 150x210 TRZ-150210.jpg",
      );
    });

    it("ref partagée sans nom de visuel : premier trouvé (comportement historique)", () => {
      expect(findPreviewFile("TRZ-150210", undefined, files)).to.equal(files[0]);
    });

    it("ref de remplissage 00000000 : aucun aperçu, même si des fichiers la contiennent", () => {
      const withZeros = ["U805 LIN 125x255 00000000 MAT.jpg", "CANOPEE CARAMEL 100x210 00000000 MAT.jpg"];
      expect(findPreviewFile("00000000", "CANOPEE CARAMEL 100x210 00000000 MAT.pdf", withZeros)).to.equal(undefined);
    });

    it("recherche insensible à la casse, limitée aux JPG", () => {
      const mixed = ["Veltis 255x60 veltis-25560.pdf", "Thumbs.db", "Veltis 255x60 veltis-25560.jpg"];
      expect(findPreviewFile("VELTIS-25560", undefined, mixed)).to.equal("Veltis 255x60 veltis-25560.jpg");
    });

    it("ref inconnue : undefined", () => {
      expect(findPreviewFile("0000000", "X", files)).to.equal(undefined);
    });
  });

  describe("getPreview", () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "decogestion-preview-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("un aperçu paysage est tourné en portrait sans être recadré", async () => {
      await new Jimp(600, 120, 0x0000ffff).writeAsync(path.join(tmpDir, "PAYSAGE 111111111 120x45.jpg"));
      const jpgName = path.join(tmpDir, "out");

      const result = await getPreview("111111111", jpgName, false, undefined, tmpDir);

      expect(result).to.equal(`${jpgName}.jpg`);
      const out = await Jimp.read(result);
      expect([out.bitmap.width, out.bitmap.height]).to.deep.equal([120, 600]);
    });

    it("renvoie false si aucun aperçu ne correspond", async () => {
      expect(await getPreview("999999999", path.join(tmpDir, "out"), false, undefined, tmpDir)).to.equal(false);
    });
  });
});
