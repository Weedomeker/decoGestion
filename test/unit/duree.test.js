const { expect } = require("chai");
const path = require("path");
const { pathToFileURL } = require("url");
const serveur = require("../../server/src/utils/duree");

const clientPath = pathToFileURL(path.join(__dirname, "../../client/src/utils/duree.js")).href;

const CAS = [
  [null, "—"],
  ["", "—"],
  ["abc", "—"],
  [-3, "—"],
  [0, "0 s"],
  [4.24, "4,2 s"],
  [9.96, "10 s"],
  [45.4, "45 s"],
  [59.6, "1 min"],
  [192, "3 min 12 s"],
  [600, "10 min"],
  [3599.6, "1 h"],
  [3900, "1 h 05 min"],
  [7260, "2 h 01 min"],
];

describe("formatDuree", () => {
  let client;
  before(async () => {
    client = await import(clientPath);
  });

  for (const [entree, attendu] of CAS) {
    it(`${JSON.stringify(entree)} → ${attendu} (serveur et client)`, () => {
      expect(serveur.formatDuree(entree)).to.equal(attendu);
      expect(client.formatDuree(entree)).to.equal(attendu);
    });
  }

  it("formatDureeMs convertit les millisecondes", () => {
    expect(serveur.formatDureeMs(192000)).to.equal("3 min 12 s");
    expect(client.formatDureeMs(192000)).to.equal("3 min 12 s");
    expect(client.formatDureeMs(null)).to.equal("—");
  });
});
