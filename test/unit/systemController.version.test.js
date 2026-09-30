const { expect } = require("chai");
const sinon = require("sinon");
const fs = require("fs");
const os = require("os");
const path = require("path");
const checkVersion = require("../../server/src/checkVersion");
const { state } = require("../../server/src/services/appState");
const systemController = require("../../server/src/controllers/systemController");

function fakeRes() {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

describe("systemController — version et changelog", () => {
  let originalRoot;
  let tmpDir;

  beforeEach(() => {
    checkVersion._resetCache();
    state.app = { version: "2.4.0", commit: "abc1234", buildDate: "2026-09-30T12:00:00.000Z" };
    originalRoot = state.paths.projectRoot;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "decogestion-sys-"));
    state.paths.projectRoot = tmpDir;
  });

  afterEach(() => {
    state.paths.projectRoot = originalRoot;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    sinon.restore();
  });

  it("GET /version renvoie version, commit, date de build et l'état de mise à jour", async () => {
    // Pré-remplit le cache avec une release plus récente (aucun appel réseau réel).
    await checkVersion({
      fetchImpl: sinon.stub().resolves({
        ok: true,
        json: async () => ({ tag_name: "v2.5.0", html_url: "https://x/v2.5.0", published_at: "2026-10-01" }),
      }),
    });
    const res = fakeRes();

    await systemController.getVersion({}, res);

    expect(res.body).to.deep.equal({
      version: "2.4.0",
      commit: "abc1234",
      buildDate: "2026-09-30T12:00:00.000Z",
      latest: { version: "2.5.0", url: "https://x/v2.5.0", publishedAt: "2026-10-01" },
      updateAvailable: true,
    });
  });

  it("GET /changelog filtre depuis `since` jusqu'à la version courante", () => {
    fs.writeFileSync(
      path.join(tmpDir, "CHANGELOG.md"),
      "# Changelog\n\n## [2.5.0] - 2026-10-10\n\n### Nouveautés\n- futur\n\n## [2.4.0] - 2026-09-30\n\n### Corrections\n- a\n",
    );
    const res = fakeRes();

    systemController.getChangelog({ query: { since: "2.3.0" } }, res);

    expect(res.body.map((e) => e.version)).to.deep.equal(["2.4.0"]);
  });

  it("GET /changelog borne `limit` (négatif ou énorme) entre 1 et 50", () => {
    const versions = Array.from({ length: 60 }, (_, i) => `## [1.0.${i}] - 2026-01-01\n\n### Corrections\n- x\n`);
    fs.writeFileSync(path.join(tmpDir, "CHANGELOG.md"), `# Changelog\n\n${versions.reverse().join("\n")}`);

    const negative = fakeRes();
    systemController.getChangelog({ query: { limit: "-3" } }, negative);
    const huge = fakeRes();
    systemController.getChangelog({ query: { limit: "999" } }, huge);

    expect(negative.body).to.have.length(1);
    expect(huge.body).to.have.length(50);
  });

  it("GET /changelog renvoie [] sans CHANGELOG", () => {
    const res = fakeRes();

    systemController.getChangelog({ query: {} }, res);

    expect(res.body).to.deep.equal([]);
  });
});
