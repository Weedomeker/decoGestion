/**
 * Tests d'intégration — CRUD des références (RefDeco / RefCasto / RefBrico / RefEcom)
 *
 * Prérequis : serveur lancé sur localhost:8000 (npm run server)
 *
 * Toutes les références créées par ces tests utilisent un préfixe unique
 * ("TEST-REF-<timestamp>") et sont supprimées en fin de test pour ne pas
 * polluer les collections réelles (lm_ref_deco, casto_ref_deco, etc.).
 */
const { expect } = require("chai");
const http = require("http");

const HOST = "127.0.0.1";
const PORT = 8000;
const RUN_ID = Date.now();
const refFor = (suffix) => `TEST-REF-${RUN_ID}-${suffix}`;

// ─── Helpers HTTP ─────────────────────────────────────────────────────────────

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
const patchJson = (endpoint, body) => httpMethod("PATCH", endpoint, body);
const deleteJson = (endpoint) => httpMethod("DELETE", endpoint);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CRUD Références — /references/:client", function () {
  this.timeout(15000);

  const createdIds = []; // [{ client, id }] — nettoyage en fin de suite

  after(async function () {
    for (const { client, id } of createdIds) {
      await deleteJson(`/references/${client}/${id}`);
    }
  });

  describe("Validation du client", function () {
    it("GET avec un client inconnu → 400", async () => {
      const res = await getJson("/references/INCONNU");
      expect(res.status).to.equal(400);
    });

    it("POST avec un client inconnu → 400", async () => {
      const res = await postJson("/references/INCONNU", { ref: refFor("x"), model: "X" });
      expect(res.status).to.equal(400);
    });
  });

  describe("Création", function () {
    ["LM", "CASTO", "BRICO", "ECOM"].forEach((client) => {
      it(`POST /references/${client} avec ref+model minimaux → 201`, async () => {
        const ref = refFor(`create-${client}`);
        const res = await postJson(`/references/${client}`, { ref, model: "Modèle Test" });
        expect(res.status).to.equal(201);
        expect(res.body.ref).to.equal(ref);
        createdIds.push({ client, id: res.body._id });
      });
    });

    it("POST sans 'model' → 400", async () => {
      const res = await postJson("/references/LM", { ref: refFor("no-model") });
      expect(res.status).to.equal(400);
    });

    it("POST avec une ref déjà existante dans la même collection → 409", async () => {
      const ref = refFor("dup");
      const first = await postJson("/references/CASTO", { ref, model: "Premier" });
      expect(first.status).to.equal(201);
      createdIds.push({ client: "CASTO", id: first.body._id });

      const second = await postJson("/references/CASTO", { ref, model: "Second" });
      expect(second.status).to.equal(409);
    });

    it("POST ECOM avec blanc=true → le champ est persisté", async () => {
      const ref = refFor("blanc");
      const res = await postJson("/references/ECOM", { ref, model: "Modèle Blanc", blanc: true });
      expect(res.status).to.equal(201);
      expect(res.body.blanc).to.equal(true);
      createdIds.push({ client: "ECOM", id: res.body._id });
    });

    it("POST BRICO avec blanc=true → le champ est ignoré (pas dans le schéma BRICO)", async () => {
      const ref = refFor("blanc-brico");
      const res = await postJson("/references/BRICO", { ref, model: "Modèle", blanc: true });
      expect(res.status).to.equal(201);
      expect(res.body.blanc).to.be.undefined;
      createdIds.push({ client: "BRICO", id: res.body._id });
    });
  });

  describe("Lecture", function () {
    it("GET /references/:client renvoie un tableau contenant les refs créées", async () => {
      const ref = refFor("list");
      const created = await postJson("/references/LM", { ref, model: "Pour Liste" });
      createdIds.push({ client: "LM", id: created.body._id });

      const res = await getJson(`/references/LM?q=${encodeURIComponent(ref)}`);
      expect(res.status).to.equal(200);
      expect(res.body.some((doc) => doc.ref === ref)).to.equal(true);
    });
  });

  describe("Modification", function () {
    it("PATCH met à jour finition/format", async () => {
      const ref = refFor("update");
      const created = await postJson("/references/LM", { ref, model: "Avant" });
      createdIds.push({ client: "LM", id: created.body._id });

      const res = await patchJson(`/references/LM/${created.body._id}`, {
        ref,
        model: "Après",
        finition: "MAT",
        format: "100x200",
      });
      expect(res.status).to.equal(200);
      expect(res.body.model).to.equal("Après");
      expect(res.body.finition).to.equal("MAT");
    });

    it("PATCH vers une ref déjà prise par un autre document → 409", async () => {
      const refA = refFor("rename-a");
      const refB = refFor("rename-b");
      const a = await postJson("/references/LM", { ref: refA, model: "A" });
      const b = await postJson("/references/LM", { ref: refB, model: "B" });
      createdIds.push({ client: "LM", id: a.body._id });
      createdIds.push({ client: "LM", id: b.body._id });

      const res = await patchJson(`/references/LM/${b.body._id}`, { ref: refA, model: "B" });
      expect(res.status).to.equal(409);
    });

    it("PATCH avec un id inexistant → 404", async () => {
      const res = await patchJson("/references/LM/507f1f77bcf86cd799439011", {
        ref: refFor("missing"),
        model: "X",
      });
      expect(res.status).to.equal(404);
    });
  });

  describe("Suppression", function () {
    it("DELETE supprime la référence, puis 404 si rejouée", async () => {
      const ref = refFor("delete");
      const created = await postJson("/references/LM", { ref, model: "À supprimer" });

      const first = await deleteJson(`/references/LM/${created.body._id}`);
      expect(first.status).to.equal(200);

      const second = await deleteJson(`/references/LM/${created.body._id}`);
      expect(second.status).to.equal(404);
    });
  });
});
