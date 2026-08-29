const { expect } = require("chai");
const { connect, disconnect } = require("../helpers/mongoTestHelper");

// mongoTestHelper.connect() démarre un MongoMemoryServer vide : aucune collection Ref*,
// donc resolveRefFields renvoie toujours { matched:false, finition:"" } — ce qui est
// exactement le comportement attendu par les assertions ci-dessous.
describe("Deco — hook sur-mesure (skip Ref* si surMesureKind === 'visuel')", function () {
  this.timeout(30000);
  let Deco;

  before(async () => {
    await connect();
    Deco = require("../../server/src/models/Deco");
  });
  after(async () => {
    await disconnect();
  });

  it("un doc surMesureKind='visuel' conserve deco/finition/format venus de Gamesys", async () => {
    const doc = await Deco.create({
      numCmd: 999001, client: "LM",
      ref: "ARCHE BEIGE", surMesure: true, surMesureKind: "visuel",
      deco: "ARCHE BEIGE", finition: "TEXTUREE", format: "125x210", orientation: "CENTRE",
    });
    expect(doc.deco).to.equal("ARCHE BEIGE");
    expect(doc.finition).to.equal("TEXTUREE");
    expect(doc.format).to.equal("125x210");
  });

  it("un doc surMesureKind='teinte_masse' passe par la résolution Ref* normale", async () => {
    // ref bidon absente de Ref* → resolveRefFields renvoie {matched:false, finition:""}
    const doc = await Deco.create({
      numCmd: 999002, client: "LM",
      ref: "ZZZ-INEXISTANT", surMesure: true, surMesureKind: "teinte_masse",
      deco: "PLACEHOLDER", finition: "PLACEHOLDER", format: "100x210",
    });
    // le hook a tourné : finition remise à "" (comportement teinte-masse existant)
    expect(doc.finition).to.equal("");
  });

  it("un doc non sur-mesure garde la résolution Ref* (non-régression)", async () => {
    const doc = await Deco.create({
      numCmd: 999003, client: "LM", ref: "ZZZ-INEXISTANT2",
      deco: "PLACEHOLDER", finition: "PLACEHOLDER",
    });
    expect(doc.finition).to.equal("");
  });
});
