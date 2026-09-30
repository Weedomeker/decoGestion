const { expect } = require("chai");
const sinon = require("sinon");
const checkVersion = require("../../server/src/checkVersion");
const { state } = require("../../server/src/services/appState");

function releaseResponse(tag) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ tag_name: tag, html_url: `https://github.com/r/${tag}`, published_at: "2026-10-01T08:00:00Z" }),
  };
}

describe("checkVersion()", () => {
  const NOW = 1_800_000_000_000;

  beforeEach(() => {
    checkVersion._resetCache();
    state.app = { version: "2.4.0", commit: "abc1234", buildDate: null };
  });

  it("signale une mise à jour quand la dernière release est plus récente", async () => {
    const fetchImpl = sinon.stub().resolves(releaseResponse("v2.5.0"));

    const result = await checkVersion({ fetchImpl, now: NOW });

    expect(result.updateAvailable).to.equal(true);
    expect(result.latest).to.deep.equal({
      version: "2.5.0",
      url: "https://github.com/r/v2.5.0",
      publishedAt: "2026-10-01T08:00:00Z",
    });
    expect(result.message).to.equal("Mise à jour disponible: 2.5.0 (actuelle: 2.4.0)");
  });

  it("ne signale rien pour un poste en avance sur la dernière release", async () => {
    state.app.version = "2.6.0";
    const fetchImpl = sinon.stub().resolves(releaseResponse("v2.5.0"));

    const result = await checkVersion({ fetchImpl, now: NOW });

    expect(result.updateAvailable).to.equal(false);
    expect(result.message).to.match(/dernière version/);
  });

  it("met le résultat en cache 1 h", async () => {
    const fetchImpl = sinon.stub().resolves(releaseResponse("v2.5.0"));

    await checkVersion({ fetchImpl, now: NOW });
    await checkVersion({ fetchImpl, now: NOW + 3_599_000 });
    expect(fetchImpl.callCount).to.equal(1);

    await checkVersion({ fetchImpl, now: NOW + 3_600_001 });
    expect(fetchImpl.callCount).to.equal(2);
  });

  it("GitHub injoignable, 404 ou quota : pas d'alerte, pas d'exception, et mise en cache de l'échec", async () => {
    const fetchImpl = sinon.stub().rejects(new Error("getaddrinfo ENOTFOUND api.github.com"));

    const result = await checkVersion({ fetchImpl, now: NOW });
    await checkVersion({ fetchImpl, now: NOW + 1000 });

    expect(result.latest).to.equal(null);
    expect(result.updateAvailable).to.equal(false);
    expect(result.message).to.match(/vérification des mises à jour indisponible/);
    expect(fetchImpl.callCount).to.equal(1);
  });

  it("traite une réponse HTTP non-ok comme un échec", async () => {
    const fetchImpl = sinon.stub().resolves({ ok: false, status: 403, json: async () => ({}) });

    const result = await checkVersion({ fetchImpl, now: NOW });

    expect(result.latest).to.equal(null);
  });
});
