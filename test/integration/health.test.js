const { expect } = require("chai");
const http = require("http");

const HOST = "127.0.0.1";
const PORT = 8000;

function httpGet(endpoint) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${HOST}:${PORT}${endpoint}`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", (e) =>
      reject(new Error(`Serveur inaccessible sur ${HOST}:${PORT} — lancez 'npm run server'. (${e.message})`))
    );
    req.setTimeout(5000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

describe("GET /health", function () {
  this.timeout(8000);

  it("retourne 200 ou 503 avec la structure attendue", async function () {
    const { status, body } = await httpGet("/health");
    expect([200, 503]).to.include(status);
    expect(body).to.have.property("status");
    expect(["ok", "degraded"]).to.include(body.status);
    expect(body).to.have.property("mongodb").that.is.a("string");
    expect(body).to.have.property("odbc").that.is.a("string");
    expect(body).to.have.property("uptime").that.is.a("number");
    expect(body).to.have.property("memory").that.is.a("number");
  });

  it("retourne status ok et 200 quand MongoDB et ODBC sont connectés", async function () {
    const { status, body } = await httpGet("/health");
    if (body.mongodb === "connected" && body.odbc === "connected") {
      expect(status).to.equal(200);
      expect(body.status).to.equal("ok");
    } else {
      this.skip();
    }
  });

  it("retourne status degraded si MongoDB ou ODBC est hors ligne", async function () {
    const { status, body } = await httpGet("/health");
    if (body.mongodb !== "connected" || body.odbc !== "connected") {
      expect(status).to.equal(503);
      expect(body.status).to.equal("degraded");
    } else {
      this.skip();
    }
  });
});

describe("Routes inconnues", function () {
  this.timeout(5000);

  it("GET /route-inexistante retourne 404 JSON", async function () {
    const { status, body } = await httpGet("/route-inexistante-xyz");
    expect(status).to.equal(404);
    expect(body).to.have.property("error").that.includes("introuvable");
  });
});
