const { expect } = require("chai");
const { buildCoteClientComment } = require("../../server/src/utils/coteClient");

describe("coteClient.buildCoteClientComment()", () => {
  it("compose la cote client (décimale FR)", () => {
    expect(buildCoteClientComment("86.9x201.5", "")).to.equal("Cote client : 86,9 × 201,5 cm");
  });
  it("entiers", () => {
    expect(buildCoteClientComment("90x210", "")).to.equal("Cote client : 90 × 210 cm");
  });
  it("concatène à un commentaire existant avec ' — '", () => {
    expect(buildCoteClientComment("90x210", "Pris en stock le 01/01"))
      .to.equal("Pris en stock le 01/01 — Cote client : 90 × 210 cm");
  });
  it("printFormat vide → commentaire inchangé", () => {
    expect(buildCoteClientComment(null, "abc")).to.equal("abc");
    expect(buildCoteClientComment("", "")).to.equal("");
  });
  it("printFormat non parsable → commentaire inchangé", () => {
    expect(buildCoteClientComment("nawak", "abc")).to.equal("abc");
  });
});
