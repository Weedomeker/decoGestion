const { expect } = require("chai");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Jimp = require("jimp");
const { composeJpgPage, resolvePageOptions, PAGE_FORMATS } = require("../../server/src/composeJpgPage");

describe("composeJpgPage — mise en page des JPG des jobs", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "decogestion-jpgpage-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function writeVisuel(name, width, height) {
    const file = path.join(tmpDir, name);
    await new Jimp(width, height, 0xff0000ff).writeAsync(file);
    return file;
  }

  it("A4 portrait par défaut quand jpgPage est absent de la config", () => {
    expect(resolvePageOptions(undefined)).to.deep.equal(PAGE_FORMATS.A4);
  });

  it("le paysage inverse largeur et hauteur", () => {
    expect(resolvePageOptions({ format: "A3", orientation: "paysage" })).to.deep.equal({
      width: PAGE_FORMATS.A3.height,
      height: PAGE_FORMATS.A3.width,
    });
  });

  it("format none : le JPG brut n'est pas modifié", async () => {
    const file = await writeVisuel("brut.jpg", 300, 900);
    const before = fs.readFileSync(file);

    expect(await composeJpgPage(file, { format: "none" })).to.equal(false);
    expect(fs.readFileSync(file).equals(before)).to.equal(true);
  });

  it("produit une page aux dimensions du format, visuel centré sous l'en-tête", async () => {
    const file = await writeVisuel("CRED 300x60cm MOSAÏQUE + VELTIS.jpg", 600, 3000);

    expect(await composeJpgPage(file, { format: "A4", orientation: "portrait" })).to.equal(true);

    const page = await Jimp.read(file);
    expect(page.bitmap.width).to.equal(PAGE_FORMATS.A4.width);
    expect(page.bitmap.height).to.equal(PAGE_FORMATS.A4.height);
    // Coin haut-gauche dans la marge : blanc. Centre de la page : le visuel rouge.
    const corner = Jimp.intToRGBA(page.getPixelColor(5, 5));
    const center = Jimp.intToRGBA(page.getPixelColor(page.bitmap.width / 2, page.bitmap.height / 2));
    expect(corner.r).to.be.above(240);
    expect(corner.g).to.be.above(240);
    expect(center.r).to.be.above(200);
    expect(center.g).to.be.below(60);
  });

  it("rejette un JPG manquant", async () => {
    let error;
    try {
      await composeJpgPage(path.join(tmpDir, "absent.jpg"), { format: "A4" });
    } catch (err) {
      error = err;
    }
    expect(error?.message).to.match(/introuvable/);
  });
});
