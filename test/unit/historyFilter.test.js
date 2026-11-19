const { expect } = require("chai");
const { buildHistoryFilter } = require("../../server/src/utils/historyFilter");

describe("buildHistoryFilter", () => {
  it("renvoie un filtre vide sans paramètre", () => {
    expect(buildHistoryFilter({})).to.deep.equal({});
    expect(buildHistoryFilter()).to.deep.equal({});
  });

  it("filtre le client exactement, sans tenir compte de la casse", () => {
    const { client } = buildHistoryFilter({ client: "casto" });
    expect(client.test("CASTO")).to.equal(true);
    expect(client.test("CASTORAMA")).to.equal(false);
  });

  it("ne plante pas sur un client contenant des caractères de regex", () => {
    let filter;
    expect(() => (filter = buildHistoryFilter({ client: "(" }))).to.not.throw();
    expect(filter.client.test("(")).to.equal(true);
    expect(buildHistoryFilter({ client: ".*" }).client.test("LM")).to.equal(false);
  });

  it("cherche le texte libre littéralement dans mag, deco et ref", () => {
    const { $or } = buildHistoryFilter({ q: "a+(b" });
    expect($or).to.have.length(3);
    expect($or[1].deco.test("X A+(B Y")).to.equal(true);
  });

  it("ajoute numCmd pour une recherche numérique", () => {
    const { $or } = buildHistoryFilter({ q: " 169580 " });
    expect($or).to.deep.include({ numCmd: 169580 });
  });

  it("cherche aussi les commandes qui commencent par un numéro partiel (suggestions Sticker)", () => {
    const { $or } = buildHistoryFilter({ q: "1693" });
    const prefixe = $or.find((c) => c.$expr);
    expect(prefixe, "clause de préfixe sur numCmd").to.exist;
    expect(prefixe.$expr.$regexMatch.regex).to.equal("^1693");
  });

  it("ignore un paramètre répété (?q=a&q=b) au lieu de planter", () => {
    expect(() => buildHistoryFilter({ q: ["a", "b"], client: ["LM", "CASTO"] })).to.not.throw();
    expect(buildHistoryFilter({ q: ["a", "b"], client: ["LM"] })).to.deep.equal({});
  });

  it("inclut toute la journée de fin (« Au 17/11 » garde les jobs du 17)", () => {
    const { date } = buildHistoryFilter({ from: "2026-11-17", to: "2026-11-17" });
    expect(date.$gte.getTime()).to.equal(new Date(2026, 10, 17, 0, 0, 0, 0).getTime());
    expect(date.$lte.getTime()).to.equal(new Date(2026, 10, 17, 23, 59, 59, 999).getTime());
  });

  it("borne les dates from / to", () => {
    const { date } = buildHistoryFilter({ from: "2026-11-01", to: "2026-11-19" });
    expect(date.$gte).to.be.instanceOf(Date);
    expect(date.$lte).to.be.instanceOf(Date);
  });
});
