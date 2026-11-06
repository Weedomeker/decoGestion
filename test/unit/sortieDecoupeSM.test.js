const { expect } = require("chai");
const path = require("path");
const { state } = require("../../server/src/services/appState");

describe("state.paths.sortieDecoupeSM", () => {
  const envInitial = process.env.NODE_ENV;
  const decoupeInitiale = state.paths.decoupeSM;

  beforeEach(() => {
    state.paths.decoupeSM = "P:\\";
  });
  afterEach(() => {
    process.env.NODE_ENV = envInitial;
    state.paths.decoupeSM = decoupeInitiale;
  });

  it("reste en local dans le dossier du jour en développement, sans toucher au chemin configuré", () => {
    process.env.NODE_ENV = "development";
    expect(state.paths.sortieDecoupeSM).to.equal(
      path.join(state.paths.serverRoot, "public", state.paths.sessionPRINTSA, "Cut"),
    );
  });

  it("utilise le chemin de config.json en production", () => {
    process.env.NODE_ENV = "production";
    expect(state.paths.sortieDecoupeSM).to.equal("P:\\");
  });
});
