/**
 * Tests d'intégration — Vérification de cohérence Références / Visuels disque
 *
 * Prérequis : serveur lancé sur localhost:8000 (npm run server)
 *
 * Le scan filesystem dépend des partages réseau montés (state.networkStatus) ;
 * si un client n'a pas son réseau monté dans l'environnement de test, le
 * rapport renvoie networkUnavailable=true pour ce client et les assertions
 * correspondantes sont sautées plutôt que de faire échouer le test.
 */
const { expect } = require("chai");
const http = require("http");

const HOST = "127.0.0.1";
const PORT = 8000;
const RUN_ID = Date.now();
const refFor = (suffix) => `TEST-REF-${RUN_ID}-${suffix}`;

function httpMethod(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : "";
    const options = {
      hostname: HOST,
      port: PORT,
      path: endpoint,
      method,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch (_) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", (e) =>
      reject(new Error(`Serveur inaccessible sur ${HOST}:${PORT} — lancez 'npm run server'. (${e.message})`)),
    );
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error(`Timeout ${method} ${endpoint}`));
    });
    req.write(payload);
    req.end();
  });
}

const getJson = (endpoint) => httpMethod("GET", endpoint);
const postJson = (endpoint, body) => httpMethod("POST", endpoint, body);
const deleteJson = (endpoint) => httpMethod("DELETE", endpoint);

describe("Vérification de cohérence — GET /references-check", function () {
  this.timeout(30000);

  const createdIds = []; // [{ client, id }]

  after(async function () {
    for (const { client, id } of createdIds) {
      await deleteJson(`/references/${client}/${id}`);
    }
  });

  it("renvoie un rapport avec les 4 clients et un horodatage", async () => {
    const res = await getJson("/references-check");
    expect(res.status).to.equal(200);
    ["LM", "CASTO", "BRICO", "ECOM"].forEach((client) => {
      expect(res.body).to.have.property(client);
    });
    expect(res.body.scannedAt).to.be.a("string");
  });

  ["LM", "CASTO", "BRICO", "ECOM"].forEach((client) => {
    it(`${client} : le rapport contient une section gamesys (ou unavailable si ODBC injoignable)`, async () => {
      const res = await getJson("/references-check");
      expect(res.status).to.equal(200);

      const gamesys = res.body[client]?.gamesys;
      expect(gamesys).to.be.an("object");

      if (gamesys.unavailable) {
        // ODBC non joignable dans cet environnement — rien à vérifier de plus.
        return;
      }

      expect(gamesys.notFoundInGamesys).to.be.an("array");
    });

    it(`${client} : une référence sans correspondance Gamesys apparaît dans notFoundInGamesys (ou unavailable)`, async () => {
      const ref = refFor(`gamesys-${client}`);
      const created = await postJson(`/references/${client}`, { ref, model: "Sans équivalent Gamesys" });
      expect(created.status).to.equal(201);
      createdIds.push({ client, id: created.body._id });

      const res = await getJson("/references-check");
      expect(res.status).to.equal(200);

      const gamesys = res.body[client]?.gamesys;
      if (gamesys.unavailable) {
        return;
      }

      const notFoundRefs = gamesys.notFoundInGamesys.map((m) => m.ref);
      expect(notFoundRefs).to.include(ref);
    });
  });

  ["LM", "CASTO", "BRICO", "ECOM"].forEach((client) => {
    it(`${client} : une référence sans visuel disque apparaît dans missingFiles (ou networkUnavailable)`, async () => {
      const ref = refFor(`missing-${client}`);
      const created = await postJson(`/references/${client}`, { ref, model: "Sans visuel disque" });
      expect(created.status).to.equal(201);
      createdIds.push({ client, id: created.body._id });

      const res = await getJson("/references-check");
      expect(res.status).to.equal(200);

      const report = res.body[client];
      if (report.networkUnavailable) {
        // Réseau non monté dans cet environnement — rien à vérifier de plus.
        return;
      }

      const missingRefs = report.missingFiles.map((m) => m.ref);
      expect(missingRefs).to.include(ref);
    });
  });
});
