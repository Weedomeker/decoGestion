const { expect } = require("chai");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { state, loadAppVersion } = require("../../server/src/services/appState");

describe("appState.loadAppVersion()", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "decogestion-version-"));
    fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ version: "2.3.0" }));
  });

  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const BUILD_INFO = { version: "2.4.0", commit: "abc1234", buildDate: "2026-09-30T12:00:00.000Z" };

  it("hors dev (prod), utilise build-info.json en priorité (poste sans .git)", () => {
    fs.writeFileSync(path.join(tmpDir, "build-info.json"), JSON.stringify(BUILD_INFO));

    loadAppVersion(tmpDir, { preferBuildInfo: true });

    expect(state.app).to.deep.equal(BUILD_INFO);
    expect(state.appVersion).to.equal("2.4.0");
  });

  it("en dev (défaut sous NODE_ENV=development), ignore un build-info.json périmé", () => {
    fs.writeFileSync(path.join(tmpDir, "build-info.json"), JSON.stringify(BUILD_INFO));

    loadAppVersion(tmpDir);

    expect(state.app.version).to.equal("2.3.0");
  });

  it("se rabat sur package.json, commit null hors dépôt git", () => {
    loadAppVersion(tmpDir, { preferBuildInfo: true });

    expect(state.app).to.deep.equal({ version: "2.3.0", commit: null, buildDate: null });
  });

  it("ignore un build-info.json corrompu", () => {
    fs.writeFileSync(path.join(tmpDir, "build-info.json"), "{ pas du json");

    loadAppVersion(tmpDir, { preferBuildInfo: true });

    expect(state.app.version).to.equal("2.3.0");
  });
});
