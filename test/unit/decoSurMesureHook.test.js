const { expect } = require("chai");
const { connect, disconnect } = require("../helpers/mongoTestHelper");

// Après le revert du "skip Ref* si surMesureKind === 'visuel'" (revue finale), le hook pre-save
// résout TOUJOURS finition/format/deco depuis Ref* dès qu'un ref est présent, sur-mesure ou non.
// Ce test tourne contre un Mongo mémoire AVEC une collection RefDeco seedée pour distinguer
// "résolution sautée" de "résolution exécutée mais sans correspondance".
describe("Deco — hook sur-mesure (résolution Ref* non sautée pour 'visuel')", function () {
  this.timeout(30000);
  let Deco;
  let RefDeco;

  before(async () => {
    await connect();
    Deco = require("../../server/src/models/Deco");
    RefDeco = require("../../server/src/models/RefDeco");
    await RefDeco.create({
      ref: "ARCHE-SM-TEST",
      model: "ARCHE BEIGE CAT",
      finition: "SATIN",
      format: "125x210",
    });
  });

  after(async () => {
    await disconnect();
  });

  it("A — un doc surMesureKind='visuel' résout finition/format/deco depuis RefDeco (non sauté) et round-trip les champs sur-mesure", async () => {
    const doc = await Deco.create({
      numCmd: 999101,
      client: "LM",
      ref: "ARCHE-SM-TEST",
      surMesure: true,
      surMesureKind: "visuel",
      orientation: "GAUCHE",
      deco: "PLACEHOLDER",
      finition: "PLACEHOLDER",
      format: "999x999",
    });
    expect(doc.deco).to.equal("ARCHE BEIGE CAT");
    expect(doc.finition).to.equal("SATIN");
    expect(doc.format).to.equal("125x210");
    expect(doc.surMesure).to.equal(true);
    expect(doc.surMesureKind).to.equal("visuel");
    expect(doc.orientation).to.equal("GAUCHE");
  });

  it("B — un ref absent de RefDeco sans finition fournie : résolution exécutée, aucune correspondance → finition ''", async () => {
    const doc = await Deco.create({
      numCmd: 999102,
      client: "LM",
      ref: "TEINTE-MASSE-ABSENTE",
      surMesure: true,
      surMesureKind: "teinte_masse",
      deco: "PLACEHOLDER",
      format: "100x210",
    });
    expect(doc.finition).to.equal("");
  });

  it("B2 — un sur-mesure au ref absent de RefDeco garde la finition fournie (vernis du panneau)", async () => {
    const doc = await Deco.create({
      numCmd: 999104,
      client: "LM",
      ref: "BAMBUSA SUR MESURE",
      surMesure: true,
      surMesureKind: "visuel",
      finition: "Mat",
    });
    expect(doc.finition).to.equal("Mat");
  });

  it("B3 — findOneAndUpdate : la finition fournie remplace celle du stub, son absence vide comme avant", async () => {
    await Deco.create({ numCmd: 999105, client: "LM", surMesure: true, finition: "Brillant", gamesysStub: true });
    const avecVernis = await Deco.findOneAndUpdate(
      { numCmd: 999105 },
      { $set: { ref: "BAMBUSA SUR MESURE", finition: "Mat" } },
      { new: true },
    );
    expect(avecVernis.finition).to.equal("Mat");

    const sansVernis = await Deco.findOneAndUpdate(
      { numCmd: 999105 },
      { $set: { ref: "BAMBUSA SUR MESURE" } },
      { new: true },
    );
    expect(sansVernis.finition).to.equal("");
  });

  it("B4 — un ref du catalogue impose sa finition, même si une autre est fournie", async () => {
    const doc = await Deco.create({ numCmd: 999106, client: "LM", ref: "ARCHE-SM-TEST", finition: "Mat" });
    expect(doc.finition).to.equal("SATIN");
  });

  it("C — un doc non sur-mesure avec ref='ARCHE-SM-TEST' résout depuis RefDeco (non-régression)", async () => {
    const doc = await Deco.create({
      numCmd: 999103,
      client: "LM",
      ref: "ARCHE-SM-TEST",
      deco: "PLACEHOLDER",
      finition: "PLACEHOLDER",
    });
    expect(doc.finition).to.equal("SATIN");
    expect(doc.deco).to.equal("ARCHE BEIGE CAT");
    expect(doc.format).to.equal("125x210");
  });
});
