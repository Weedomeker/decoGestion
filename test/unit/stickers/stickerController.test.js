const { expect } = require("chai");
const sinon = require("sinon");
const StickerModele = require("../../../server/src/models/StickerModele");
const StickerImage = require("../../../server/src/models/StickerImage");
const ctrl = require("../../../server/src/controllers/stickerController");

const ID = "64b000000000000000000001";
const reponse = () => {
  const res = { statusCode: 200 };
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b) => {
    res.body = b;
    return res;
  };
  return res;
};
const lean = (v) => ({ lean: async () => v });
// PNG 1×1 minimal (signature + IHDR)
const PNG = Buffer.concat([
  Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"),
  Buffer.from("00000001000000010806000000", "hex"),
  Buffer.alloc(20),
]);

describe("stickerController", () => {
  afterEach(() => sinon.restore());

  it("refuse de supprimer le modèle par défaut d'une enseigne", async () => {
    sinon.stub(StickerModele, "findById").returns(lean({ _id: ID, parDefaut: true }));
    const del = sinon.stub(StickerModele, "deleteOne");
    const res = reponse();
    await ctrl.supprimerModele({ params: { id: ID } }, res);
    expect(res.statusCode).to.equal(409);
    expect(del.called).to.equal(false);
  });

  it("un nouveau modèle par défaut retire le drapeau aux autres modèles de l'enseigne", async () => {
    sinon.stub(StickerModele, "create").resolves({ _id: ID, toObject: () => ({ _id: ID }) });
    const update = sinon.stub(StickerModele, "updateMany").resolves();
    const res = reponse();
    await ctrl.creerModele({ body: { nom: "Fragile", client: "LM", parDefaut: true, elements: [] } }, res);
    expect(res.statusCode).to.equal(201);
    expect(update.firstCall.args[0]).to.deep.include({ client: "LM", parDefaut: true });
  });

  it("un modèle sans enseigne ne peut pas être par défaut", async () => {
    const create = sinon.stub(StickerModele, "create").resolves({ _id: ID, toObject: () => ({}) });
    sinon.stub(StickerModele, "updateMany").resolves();
    await ctrl.creerModele({ body: { nom: "Libre", parDefaut: true } }, reponse());
    expect(create.firstCall.args[0].parDefaut).to.equal(false);
  });

  it("refuse de retirer le drapeau défaut sans en désigner un autre", async () => {
    sinon.stub(StickerModele, "findById").resolves({ parDefaut: true, client: "LM", save: sinon.stub() });
    const res = reponse();
    await ctrl.modifierModele({ params: { id: ID }, body: { parDefaut: false } }, res);
    expect(res.statusCode).to.equal(409);
  });

  it("import d'image : refuse un format autre que PNG/JPG", async () => {
    const res = reponse();
    await ctrl.importerImage({ body: { dataUrl: "data:image/gif;base64,R0lGOD" } }, res);
    expect(res.statusCode).to.equal(400);
  });

  it("import d'image : refuse au-delà de 2 Mo", async () => {
    const gros = Buffer.concat([PNG, Buffer.alloc(ctrl.TAILLE_MAX_IMAGE)]);
    const res = reponse();
    await ctrl.importerImage({ body: { dataUrl: `data:image/png;base64,${gros.toString("base64")}` } }, res);
    expect(res.statusCode).to.equal(413);
  });

  it("import d'image : enregistre un PNG avec ses dimensions", async () => {
    const create = sinon.stub(StickerImage, "create").resolves({ _id: ID, nom: "Logo", mime: "image/png" });
    const res = reponse();
    await ctrl.importerImage({ body: { nom: "Logo", dataUrl: `data:image/png;base64,${PNG.toString("base64")}` } }, res);
    expect(res.statusCode).to.equal(201);
    expect(create.firstCall.args[0]).to.include({ largeur: 1, hauteur: 1, mime: "image/png" });
  });
});
