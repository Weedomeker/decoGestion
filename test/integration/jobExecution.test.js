/**
 * Tests d'intégration — Exécution complète des jobs (add_job → run_jobs → fichiers disque)
 * Prérequis : serveur lancé sur localhost:8000 (npm run server)
 */
const { expect } = require("chai");
const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST = "127.0.0.1";
const PORT = 8000;
const PROJECT_ROOT = path.resolve(__dirname, "../..");

const TAURO_FORMATS = [
  "Deco_Std_101x215",
  "Deco_Std_126x260",
  "Deco_Std_150x305",
  "Deco_Std_151x260",
];

// ─── Helpers HTTP ─────────────────────────────────────────────────────────────

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
    req.setTimeout(10000, () => { req.destroy(); reject(new Error(`Timeout GET ${endpoint}`)); });
  });
}

function httpMethod(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: HOST,
      port: PORT,
      path: endpoint,
      method,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }); }
        catch (_) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error(`Timeout ${method} ${endpoint}`)); });
    req.write(payload);
    req.end();
  });
}

const postJson = (endpoint, body) => httpMethod("POST", endpoint, body);
const deleteJson = (endpoint, body) => httpMethod("DELETE", endpoint, body);

async function clearAllJobs() {
  const r = await httpGet("/jobs");
  const jobs = r.body?.jobs || [];
  for (const job of jobs) {
    await deleteJson("/delete_job", { _id: job._id });
  }
  await deleteJson("/delete_job_completed", { clear: true });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveJpgPath(jpgName) {
  return path.join(PROJECT_ROOT, "server", jpgName);
}

function cleanFiles(files) {
  files.forEach((f) => {
    if (f && fs.existsSync(f)) { try { fs.unlinkSync(f); } catch (_) {} }
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Exécution complète des jobs — tous clients (intégration live)", function () {

  // ── 1. LM 165130 — Teinte masse BLANC ZÉRO 100x210 ──────────────────────

  describe("Dossier 165130 — LM teinte masse (BLANC ZÉRO 100x210)", function () {
    this.timeout(60000);

    let addResp;
    let jpgPath;

    const PAYLOAD = {
      client: "LM",
      numCmd: "165130",
      numCmd2: 0,
      ville: "MONTIVILLIERS",
      ex: 2,
      teinteMasse: true,
      prodBlanc: false,
      visuel: "BLANC ZERO MAT",
      format: "server/public/LM/1_100x210/",
      formatTauro: "Deco_Std_101x215",
      allFormatTauro: TAURO_FORMATS,
      perte: null,
      regmarks: false,
      cut: false,
      stock: false,
    };

    before(async function () {
      await clearAllJobs();
      addResp = await postJson("/add_job", PAYLOAD);
      expect(addResp.status, "add_job doit retourner 201 (job déjà présent ?)").to.equal(201);
      await postJson("/run_jobs", { run: true });
      await wait(5000);
      jpgPath = resolveJpgPath(addResp.body.object.jpgName);
    });

    after(async function () {
      await clearAllJobs();
      cleanFiles([jpgPath]);
    });

    it("add_job retourne 201", () => expect(addResp.status).to.equal(201));
    it("client = LM", () => expect(addResp.body.object.client).to.equal("LM"));
    it("ville = MONTIVILLIERS", () => expect(addResp.body.object.ville).to.equal("MONTIVILLIERS"));
    it("format_visu = 100x210", () => expect(addResp.body.object.format_visu).to.equal("100x210"));
    it("format_Plaque = 101x215", () => expect(addResp.body.object.format_Plaque).to.equal("101x215"));
    it("teinteMasse = true", () => expect(addResp.body.object.teinteMasse).to.be.true);
    it("ex = 2", () => expect(addResp.body.object.ex).to.equal(2));
    it("writePath contient Deco_Std_101x215", () => expect(addResp.body.object.writePath).to.include("Deco_Std_101x215"));
    it("jpgName commence par public/PRINTSA#", () => expect(addResp.body.object.jpgName).to.match(/^public\/PRINTSA#/));
    it("JPG généré existe sur disque", () => {
      expect(fs.existsSync(jpgPath), `JPG introuvable : ${jpgPath}`).to.be.true;
    });
    it("aucun PDF pour une teinte masse", () => {
      const fn = path.basename(addResp.body.object.jpgName, ".jpg");
      const pdfPath = path.join(addResp.body.object.writePath, fn + ".pdf");
      expect(fs.existsSync(pdfPath), `PDF ne devrait pas exister : ${pdfPath}`).to.be.false;
    });
  });

  // ── 2. LM 101921 — Visuel normal ALAGOAS DROIT 100x255 ──────────────────

  describe("Dossier 101921 — LM visuel normal (ALAGOAS DROIT 100x255)", function () {
    this.timeout(60000);

    let addResp;
    let jpgPath, pdfPath;

    const PAYLOAD = {
      client: "LM",
      numCmd: "101921",
      numCmd2: 0,
      ville: "BOE",
      ex: 1,
      teinteMasse: false,
      prodBlanc: false,
      visuel: "server/public/LM/4_100x255/ALAGOAS 100x255 DROIT 94953563 MAT.pdf",
      format: "server/public/LM/4_100x255/",
      formatTauro: "Deco_Std_126x260",
      allFormatTauro: TAURO_FORMATS,
      perte: null,
      regmarks: false,
      cut: false,
      stock: false,
    };

    before(async function () {
      await clearAllJobs();
      addResp = await postJson("/add_job", PAYLOAD);
      expect(addResp.status, "add_job doit retourner 201 (job déjà présent ?)").to.equal(201);
      await postJson("/run_jobs", { run: true });
      await wait(5000);
      jpgPath = resolveJpgPath(addResp.body.object.jpgName);
      const fn = path.basename(addResp.body.object.jpgName, ".jpg");
      pdfPath = path.join(addResp.body.object.writePath, fn + ".pdf");
    });

    after(async function () {
      await clearAllJobs();
      cleanFiles([jpgPath, pdfPath]);
    });

    it("add_job retourne 201", () => expect(addResp.status).to.equal(201));
    it("client = LM", () => expect(addResp.body.object.client).to.equal("LM"));
    it("ville = BOE", () => expect(addResp.body.object.ville).to.equal("BOE"));
    it("format_visu = 100x255", () => expect(addResp.body.object.format_visu).to.equal("100x255"));
    it("format_Plaque = 126x260", () => expect(addResp.body.object.format_Plaque).to.equal("126x260"));
    it("teinteMasse = false", () => expect(addResp.body.object.teinteMasse).to.be.false);
    it("ref = 94953563", () => expect(String(addResp.body.object.ref)).to.equal("94953563"));
    it("ex = 1", () => expect(addResp.body.object.ex).to.equal(1));
    it("writePath contient Deco_Std_126x260", () => expect(addResp.body.object.writePath).to.include("Deco_Std_126x260"));
    it("jpgName commence par public/PRINTSA#", () => expect(addResp.body.object.jpgName).to.match(/^public\/PRINTSA#/));
    it("PDF généré existe sur disque", () => {
      expect(fs.existsSync(pdfPath), `PDF introuvable : ${pdfPath}`).to.be.true;
    });
    it("PDF est dans le dossier Deco_Std_126x260", () => expect(pdfPath).to.include("Deco_Std_126x260"));
    it("JPG généré existe sur disque", () => {
      expect(fs.existsSync(jpgPath), `JPG introuvable : ${jpgPath}`).to.be.true;
    });
  });

  // ── 3. ECOM 165673 — Teinte masse ALU BROSSÉ 100x210 ────────────────────

  describe("Dossier 165673 — ECOM teinte masse (ALU BROSSÉ 100x210)", function () {
    this.timeout(60000);

    let addResp;
    let jpgPath;

    const PAYLOAD = {
      client: "ECOM",
      numCmd: "165673",
      numCmd2: 0,
      ville: "Théa Lozneanu",
      ex: 1,
      teinteMasse: true,
      prodBlanc: false,
      visuel: "ALU BROSSE",
      format: "server/public/ECOM/1_100x210/",
      formatTauro: "Deco_Std_150x305",
      allFormatTauro: TAURO_FORMATS,
      perte: null,
      regmarks: false,
      cut: false,
      stock: false,
    };

    before(async function () {
      await clearAllJobs();
      addResp = await postJson("/add_job", PAYLOAD);
      expect(addResp.status, "add_job doit retourner 201 (job déjà présent ?)").to.equal(201);
      await postJson("/run_jobs", { run: true });
      await wait(5000);
      jpgPath = resolveJpgPath(addResp.body.object.jpgName);
    });

    after(async function () {
      await clearAllJobs();
      cleanFiles([jpgPath]);
    });

    it("add_job retourne 201", () => expect(addResp.status).to.equal(201));
    it("client = ECOM", () => expect(addResp.body.object.client).to.equal("ECOM"));
    it("ville = THÉA LOZNEANU", () => expect(addResp.body.object.ville).to.equal("THÉA LOZNEANU"));
    it("format_visu = 100x210", () => expect(addResp.body.object.format_visu).to.equal("100x210"));
    it("format_Plaque = 150x305", () => expect(addResp.body.object.format_Plaque).to.equal("150x305"));
    it("teinteMasse = true", () => expect(addResp.body.object.teinteMasse).to.be.true);
    it("writePath contient Deco_Std_150x305", () => expect(addResp.body.object.writePath).to.include("Deco_Std_150x305"));
    it("jpgName commence par public/PRINTSA#", () => expect(addResp.body.object.jpgName).to.match(/^public\/PRINTSA#/));
    it("JPG généré existe sur disque", () => {
      expect(fs.existsSync(jpgPath), `JPG introuvable : ${jpgPath}`).to.be.true;
    });
    it("aucun PDF pour une teinte masse", () => {
      const fn = path.basename(addResp.body.object.jpgName, ".jpg");
      const pdfPath = path.join(addResp.body.object.writePath, fn + ".pdf");
      expect(fs.existsSync(pdfPath), `PDF ne devrait pas exister : ${pdfPath}`).to.be.false;
    });
  });

  // ── 4. ECOM 164771 — Visuel normal Hokusai Droit 100x210 ─────────────────

  describe("Dossier 164771 — ECOM visuel normal (Hokusai Droit 100x210)", function () {
    this.timeout(60000);

    let addResp;
    let jpgPath, pdfPath;

    const PAYLOAD = {
      client: "ECOM",
      numCmd: "164771",
      numCmd2: 0,
      ville: "Stéphane Corler",
      ex: 1,
      teinteMasse: false,
      prodBlanc: false,
      visuel: "server/public/ECOM/1_100x210/HOKUSAI DROIT 100x210 MAT HOKUSAID-100210.pdf",
      format: "server/public/ECOM/1_100x210/",
      formatTauro: "Deco_Std_101x215",
      allFormatTauro: TAURO_FORMATS,
      perte: null,
      regmarks: false,
      cut: false,
      stock: false,
    };

    before(async function () {
      await clearAllJobs();
      addResp = await postJson("/add_job", PAYLOAD);
      expect(addResp.status, "add_job doit retourner 201 (job déjà présent ?)").to.equal(201);
      await postJson("/run_jobs", { run: true });
      await wait(5000);
      jpgPath = resolveJpgPath(addResp.body.object.jpgName);
      const fn = path.basename(addResp.body.object.jpgName, ".jpg");
      pdfPath = path.join(addResp.body.object.writePath, fn + ".pdf");
    });

    after(async function () {
      await clearAllJobs();
      cleanFiles([jpgPath, pdfPath]);
    });

    it("add_job retourne 201", () => expect(addResp.status).to.equal(201));
    it("client = ECOM", () => expect(addResp.body.object.client).to.equal("ECOM"));
    it("ville = STÉPHANE CORLER", () => expect(addResp.body.object.ville).to.equal("STÉPHANE CORLER"));
    it("format_visu = 100x210", () => expect(addResp.body.object.format_visu).to.equal("100x210"));
    it("format_Plaque = 101x215", () => expect(addResp.body.object.format_Plaque).to.equal("101x215"));
    it("teinteMasse = false", () => expect(addResp.body.object.teinteMasse).to.be.false);
    it("ref = HOKUSAID-100210", () => expect(addResp.body.object.ref).to.equal("HOKUSAID-100210"));
    it("writePath contient Deco_Std_101x215", () => expect(addResp.body.object.writePath).to.include("Deco_Std_101x215"));
    it("jpgName commence par public/PRINTSA#", () => expect(addResp.body.object.jpgName).to.match(/^public\/PRINTSA#/));
    it("PDF généré existe sur disque", () => {
      expect(fs.existsSync(pdfPath), `PDF introuvable : ${pdfPath}`).to.be.true;
    });
    it("PDF est dans le dossier Deco_Std_101x215", () => expect(pdfPath).to.include("Deco_Std_101x215"));
    it("JPG généré existe sur disque", () => {
      expect(fs.existsSync(jpgPath), `JPG introuvable : ${jpgPath}`).to.be.true;
    });
  });

  // ── 5. CASTO 165888 — Crédences TERRAZZO 300x60 (add_job uniquement) ─────
  // La crédence nécessite 2 panneaux (visuel + visuel2) → run_jobs non testé ici.

  describe("Dossier 165888 — CASTO crédences 300x60 (add_job uniquement)", function () {
    this.timeout(30000);

    let addResp;

    const PAYLOAD = {
      client: "CASTO",
      numCmd: "165888",
      numCmd2: "165888",
      ville: "Locmaria-Plouzané",
      ex: 1,
      teinteMasse: false,
      prodBlanc: false,
      visuel: "server/public/CASTO/2_300x60/CRED 300x60cm TERRAZZO GRIS 3664712481068 MAT.pdf",
      format: "server/public/CASTO/2_300x60/",
      visuel2: "server/public/CASTO/2_300x60/CRED 300x60cm MARBRE BLANC 3664714023259 MAT.pdf",
      format2: "server/public/CASTO/2_300x60/",
      formatTauro: "Deco_Std_150x305",
      allFormatTauro: TAURO_FORMATS,
      perte: null,
      regmarks: false,
      cut: false,
      stock: false,
    };

    before(async function () {
      await clearAllJobs();
      addResp = await postJson("/add_job", PAYLOAD);
    });

    after(async function () {
      if (addResp?.body?.object?._id) {
        await deleteJson("/delete_job", { _id: addResp.body.object._id });
      }
    });

    it("add_job retourne 201", () => expect(addResp.status).to.equal(201));
    it("client = CASTO", () => expect(addResp.body.object.client).to.equal("CASTO"));
    it("ville = LOCMARIA-PLOUZANÉ", () => expect(addResp.body.object.ville).to.equal("LOCMARIA-PLOUZANÉ"));
    it("format_visu = 300x60 (format crédences)", () => expect(addResp.body.object.format_visu).to.equal("300x60"));
    it("format_Plaque = 150x305", () => expect(addResp.body.object.format_Plaque).to.equal("150x305"));
    it("writePath contient Deco_Std_150x305", () => expect(addResp.body.object.writePath).to.include("Deco_Std_150x305"));
    it("jpgName commence par public/PRINTSA#", () => expect(addResp.body.object.jpgName).to.match(/^public\/PRINTSA#/));
  });

  // ── 6. BRICO 165520 — Visuel normal CALACATTA 100x255 ───────────────────

  describe("Dossier 165520 — BRICO visuel normal (CALACATTA 100x255)", function () {
    this.timeout(60000);

    let addResp;
    let jpgPath, pdfPath;

    const PAYLOAD = {
      client: "BRICO",
      numCmd: "165520",
      numCmd2: 0,
      ville: "LA FLECHE",
      ex: 1,
      teinteMasse: false,
      prodBlanc: false,
      visuel: "server/public/BRICO/4_100x255/CALACATTA BRILLANT 100x255 CALACA-100255.pdf",
      format: "server/public/BRICO/4_100x255/",
      formatTauro: "Deco_Std_126x260",
      allFormatTauro: TAURO_FORMATS,
      perte: null,
      regmarks: false,
      cut: false,
      stock: false,
    };

    before(async function () {
      await clearAllJobs();
      addResp = await postJson("/add_job", PAYLOAD);
      expect(addResp.status, "add_job doit retourner 201 (job déjà présent ?)").to.equal(201);
      await postJson("/run_jobs", { run: true });
      await wait(5000);
      jpgPath = resolveJpgPath(addResp.body.object.jpgName);
      const fn = path.basename(addResp.body.object.jpgName, ".jpg");
      pdfPath = path.join(addResp.body.object.writePath, fn + ".pdf");
    });

    after(async function () {
      await clearAllJobs();
      cleanFiles([jpgPath, pdfPath]);
    });

    it("add_job retourne 201", () => expect(addResp.status).to.equal(201));
    it("client = BRICO", () => expect(addResp.body.object.client).to.equal("BRICO"));
    it("ville = LA FLECHE", () => expect(addResp.body.object.ville).to.equal("LA FLECHE"));
    it("format_visu = 100x255", () => expect(addResp.body.object.format_visu).to.equal("100x255"));
    it("format_Plaque = 126x260", () => expect(addResp.body.object.format_Plaque).to.equal("126x260"));
    it("teinteMasse = false", () => expect(addResp.body.object.teinteMasse).to.be.false);
    it("ref = CALACA-100255", () => expect(addResp.body.object.ref).to.equal("CALACA-100255"));
    it("ex = 1", () => expect(addResp.body.object.ex).to.equal(1));
    it("writePath contient Deco_Std_126x260", () => expect(addResp.body.object.writePath).to.include("Deco_Std_126x260"));
    it("jpgName commence par public/PRINTSA#", () => expect(addResp.body.object.jpgName).to.match(/^public\/PRINTSA#/));
    it("PDF généré existe sur disque", () => {
      expect(fs.existsSync(pdfPath), `PDF introuvable : ${pdfPath}`).to.be.true;
    });
    it("PDF est dans le dossier Deco_Std_126x260", () => expect(pdfPath).to.include("Deco_Std_126x260"));
    it("JPG généré existe sur disque", () => {
      expect(fs.existsSync(jpgPath), `JPG introuvable : ${jpgPath}`).to.be.true;
    });
  });
});
