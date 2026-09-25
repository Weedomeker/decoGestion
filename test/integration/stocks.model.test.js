const { expect } = require("chai");
const { connect, disconnect, clearCollections } = require("../helpers/mongoTestHelper");
const Stocks = require("../../server/src/models/Stocks");

describe("Modèle Stocks (intégration)", () => {
  before(async () => {
    await connect();
  });

  after(async () => {
    await disconnect();
  });

  afterEach(async () => {
    await clearCollections();
  });

  it("crée et retrouve un stock par référence", async () => {
    await Stocks.create({
      visuel: "HOKUSAID-100210.pdf",
      ref: "HOKUSAID-100210",
      format: "100x210",
      finition: "mat",
      ex: 3,
    });

    const found = await Stocks.findOne({ ref: "HOKUSAID-100210" });

    expect(found).to.not.be.null;
    expect(found.visuel).to.equal("HOKUSAID-100210.pdf");
    expect(found.format).to.equal("100x210");
    expect(found.ex).to.equal(3);
  });

  it("findOneAndUpdate décrémente ex de 1", async () => {
    await Stocks.create({
      visuel: "U565-100210.pdf",
      ref: "U565-100210",
      format: "100x210",
      finition: "",
      ex: 3,
    });

    const updated = await Stocks.findOneAndUpdate(
      { ref: "U565-100210" },
      { $inc: { ex: -1 } },
      { new: true }
    );

    expect(updated.ex).to.equal(2);
  });

  it("supprime automatiquement le document quand ex atteint 0 (hook post findOneAndUpdate)", async () => {
    await Stocks.create({
      visuel: "LASTEX-100210.pdf",
      ref: "LASTEX-100210",
      format: "100x210",
      finition: "",
      ex: 1,
    });

    await Stocks.findOneAndUpdate(
      { ref: "LASTEX-100210" },
      { $inc: { ex: -1 } },
      { new: true }
    );

    // Laisser le temps au hook post async de s'exécuter
    await new Promise((resolve) => setTimeout(resolve, 100));

    const deleted = await Stocks.findOne({ ref: "LASTEX-100210" });
    expect(deleted).to.be.null;
  });

  it("retourne null pour une référence inexistante", async () => {
    const result = await Stocks.findOne({ ref: "REF-INEXISTANTE" });
    expect(result).to.be.null;
  });

  it("ne supprime pas le stock si ex > 0 après décrémentation", async () => {
    await Stocks.create({
      visuel: "MULTI-100210.pdf",
      ref: "MULTI-100210",
      format: "100x210",
      finition: "",
      ex: 5,
    });

    await Stocks.findOneAndUpdate(
      { ref: "MULTI-100210" },
      { $inc: { ex: -1 } },
      { new: true }
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    const still = await Stocks.findOne({ ref: "MULTI-100210" });
    expect(still).to.not.be.null;
    expect(still.ex).to.equal(4);
  });
});
