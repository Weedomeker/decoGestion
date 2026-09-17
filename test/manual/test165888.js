/**
 * Test manuel — Dossier 165888 — CASTO crédence 300x60
 * Vérifie le process complet : add_job → run_jobs → fichiers disque → MongoDB
 *
 * ⚠️  Les fichiers de sortie NE sont PAS supprimés après le test.
 *     Vérifier manuellement dans writePath et le dossier PRINTSA.
 *
 * Prérequis : serveur lancé sur localhost:8000 (npm run server)
 * Lancer   : npx mocha test/integration/test165888.js --timeout 120000
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
      hostname: HOST, port: PORT, path: endpoint, method,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
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
    req.setTimeout(60000, () => { req.destroy(); reject(new Error(`Timeout ${method} ${endpoint}`)); });
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

function resolveJpgDir(jpgName) {
  return path.join(PROJECT_ROOT, "server", path.dirname(jpgName));
}

function findFilesInDir(dir, suffix) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(suffix));
}

function logSection(title) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(60)}`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Dossier 165888 — CASTO crédence 300x60 — process complet", function () {

  // ════════════════════════════════════════════════════════════════════════════
  // CAS A : ex=1 — TERRAZZO GRIS + MARBRE BLANC (2 visuels différents)
  // ════════════════════════════════════════════════════════════════════════════

  describe("CAS A — ex=1 — TERRAZZO GRIS + MARBRE BLANC (visuels différents)", function () {
    this.timeout(120000);

    let addResp, runResp;
    let writePath, jpgDir;
    let testStartTime;

    const PAYLOAD_A = {
      client: "CASTO",
      numCmd: "165888",
      numCmd2: "165888",
      ville: "Locmaria-Plouzane",
      ex: 1,
      teinteMasse: false,
      prodBlanc: false,
      visuel:  "server/public/CASTO/2_300x60/CRED 300x60cm TERRAZZO GRIS 3664712481068 MAT.pdf",
      format:  "server/public/CASTO/2_300x60/",
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
      testStartTime = new Date();
      logSection("CAS A — add_job 165888 ex=1 (TERRAZZO GRIS + MARBRE BLANC)");
      await clearAllJobs();
      addResp = await postJson("/add_job", PAYLOAD_A);
      console.log(`\n  add_job status : ${addResp.status}`);
      if (addResp.body?.object) {
        const o = addResp.body.object;
        console.log(`  cmd         : ${o.cmd}`);
        console.log(`  cmd2        : ${o.cmd2}`);
        console.log(`  client      : ${o.client}`);
        console.log(`  ville       : ${o.ville}`);
        console.log(`  format_visu : ${o.format_visu}`);
        console.log(`  format_Plaque : ${o.format_Plaque}`);
        console.log(`  ref         : ${o.ref}`);
        console.log(`  ref2        : ${o.ref2}`);
        console.log(`  ex          : ${o.ex}`);
        console.log(`  visuel      : ${o.visuel}`);
        console.log(`  visuel2     : ${o.visuel2}`);
        console.log(`  visuPath    : ${o.visuPath}`);
        console.log(`  visuPath2   : ${o.visuPath2}`);
        console.log(`  writePath   : ${o.writePath}`);
        console.log(`  jpgName     : ${o.jpgName}`);
      } else {
        console.log(`  Erreur : ${JSON.stringify(addResp.body)}`);
      }

      expect(addResp.status, "add_job doit retourner 201").to.equal(201);

      writePath = addResp.body.object.writePath;
      jpgDir = resolveJpgDir(addResp.body.object.jpgName);

      logSection("CAS A — run_jobs");
      runResp = await postJson("/run_jobs", { run: true });
      console.log(`\n  run_jobs status : ${runResp.status}`);
      await wait(15000);

      console.log(`\n  Fichiers dans writePath (${writePath}) :`);
      findFilesInDir(writePath, ".pdf")
        .filter((f) => f.startsWith("165888"))
        .forEach((f) => {
          const stat = fs.statSync(path.join(writePath, f));
          console.log(`    📄 ${f}  (${stat.size} octets)`);
        });

      console.log(`\n  Fichiers JPG dans ${jpgDir} :`);
      findFilesInDir(jpgDir, ".jpg")
        .filter((f) => f.startsWith("165888"))
        .forEach((f) => {
          const stat = fs.statSync(path.join(jpgDir, f));
          console.log(`    🖼  ${f}  (${stat.size} octets)`);
        });
    });

    // ── add_job ──────────────────────────────────────────────────────────────
    it("add_job retourne 201", () => expect(addResp.status).to.equal(201));
    it("client = CASTO", () => expect(addResp.body.object.client).to.equal("CASTO"));
    it("format_visu = 300x60", () => expect(addResp.body.object.format_visu).to.equal("300x60"));
    it("format_Plaque = 150x305", () => expect(addResp.body.object.format_Plaque).to.equal("150x305"));
    it("ref = EAN-13 TERRAZZO GRIS (3664712481068)", () =>
      expect(String(addResp.body.object.ref)).to.equal("3664712481068"));
    it("ref2 = EAN-13 MARBRE BLANC (3664714023259)", () =>
      expect(String(addResp.body.object.ref2)).to.equal("3664714023259"));
    it("visuPath contient TERRAZZO GRIS", () =>
      expect(addResp.body.object.visuPath).to.include("TERRAZZO GRIS"));
    it("visuPath2 contient MARBRE BLANC", () =>
      expect(addResp.body.object.visuPath2).to.include("MARBRE BLANC"));
    it("visuPath2 ≠ visuPath (visuels différents)", () =>
      expect(addResp.body.object.visuPath2).to.not.equal(addResp.body.object.visuPath));
    it("ex = 1", () => expect(addResp.body.object.ex).to.equal(1));
    it("writePath contient Deco_Std_150x305", () =>
      expect(addResp.body.object.writePath).to.include("Deco_Std_150x305"));

    // ── run_jobs — fichiers disque ────────────────────────────────────────────
    it("run_jobs retourne 200", () => expect(runResp.status).to.equal(200));
    it("PDF amalgamé généré (contient ' + ')", () => {
      const pdfs = findFilesInDir(writePath, ".pdf").filter((f) => f.startsWith("165888"));
      const amalgame = pdfs.find((f) => f.includes(" + "));
      expect(amalgame,
        `Aucun PDF amalgamé trouvé dans ${writePath}.\nPDFs : ${pdfs.join(", ") || "(vide)"}`
      ).to.be.ok;
    });
    it("PDF amalgamé non vide (taille > 0)", () => {
      const pdfs = findFilesInDir(writePath, ".pdf").filter((f) => f.startsWith("165888"));
      const amalgame = pdfs.find((f) => f.includes(" + "));
      expect(amalgame, "PDF amalgamé introuvable").to.be.ok;
      expect(fs.statSync(path.join(writePath, amalgame)).size).to.be.greaterThan(0);
    });
    it("PDF contient ref TERRAZZO dans le nom", () => {
      const pdfs = findFilesInDir(writePath, ".pdf").filter((f) => f.startsWith("165888"));
      const found = pdfs.some((f) => f.toUpperCase().includes("TERRAZZO"));
      expect(found, `Aucun PDF avec TERRAZZO. PDFs : ${pdfs.join(", ")}`).to.be.true;
    });
    it("PDF contient ref MARBRE dans le nom", () => {
      const pdfs = findFilesInDir(writePath, ".pdf").filter((f) => f.startsWith("165888"));
      const found = pdfs.some((f) => f.toUpperCase().includes("MARBRE"));
      expect(found, `Aucun PDF avec MARBRE. PDFs : ${pdfs.join(", ")}`).to.be.true;
    });
    it("JPG amalgamé généré et non vide", () => {
      const jpgs = findFilesInDir(jpgDir, ".jpg").filter((f) => f.startsWith("165888"));
      const amalgame = jpgs.find((f) => f.includes(" + "));
      expect(amalgame,
        `Aucun JPG amalgamé trouvé dans ${jpgDir}.\nJPGs : ${jpgs.join(", ") || "(vide)"}`
      ).to.be.ok;
      expect(fs.statSync(path.join(jpgDir, amalgame)).size).to.be.greaterThan(0);
    });

    // ── MongoDB ───────────────────────────────────────────────────────────────
    it("2 entrées Deco créées dans MongoDB ce run (TERRAZZO + MARBRE BLANC)", async () => {
      const r = await httpGet("/history?limit=20");
      expect(r.status, "GET /history doit retourner 200").to.equal(200);
      const entries = r.body?.data || [];
      // Filtrer uniquement les entrées créées PENDANT ce test (par date)
      const thisRun = entries.filter(
        (e) => e.numCmd === 165888 && new Date(e.date) >= testStartTime,
      );
      console.log(`\n  MongoDB /history (${entries.length} entrées récentes) :`);
      entries.slice(0, 6).forEach((e) => {
        console.log(`    cmd=${e.numCmd} | deco="${e.deco}" | ref=${e.ref} | format=${e.format} | ex=${e.ex} | date=${e.date}`);
      });
      console.log(`\n  Entrées de CE run pour cmd=165888 : ${thisRun.length}`);
      expect(thisRun.length,
        `Attendu 2 entrées (TERRAZZO + MARBRE BLANC) : ${JSON.stringify(thisRun.map((e) => ({ deco: e.deco, ref: e.ref })))}`
      ).to.equal(2);
      const refs = thisRun.map((e) => String(e.ref));
      expect(refs, "ref TERRAZZO GRIS attendue").to.include("3664712481068");
      expect(refs, "ref MARBRE BLANC attendue").to.include("3664714023259");
      thisRun.forEach((e) => {
        expect(e.deco, `deco vide pour ref=${e.ref}`).to.be.ok;
        expect(e.format, "format doit être 300x60").to.equal("300x60");
        expect(e.ex, `ex doit être 1 pour ref=${e.ref}`).to.equal(1);
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // CAS B : ex=2 — TERRAZZO GRIS seulement → duplication automatique
  // ════════════════════════════════════════════════════════════════════════════

  describe("CAS B — ex=2 — TERRAZZO GRIS seul (duplication automatique ×2)", function () {
    this.timeout(120000);

    let addResp, runResp;
    let writePath, jpgDir;
    let testStartTime;

    const PAYLOAD_B = {
      client: "CASTO",
      numCmd: "165888",
      numCmd2: "165888",
      ville: "Locmaria-Plouzane",
      ex: 2,
      teinteMasse: false,
      prodBlanc: false,
      visuel:  "server/public/CASTO/2_300x60/CRED 300x60cm TERRAZZO GRIS 3664712481068 MAT.pdf",
      format:  "server/public/CASTO/2_300x60/",
      visuel2: "",   // délibérément vide — le backend doit dupliquer
      format2: "",
      formatTauro: "Deco_Std_150x305",
      allFormatTauro: TAURO_FORMATS,
      perte: null,
      regmarks: false,
      cut: false,
      stock: false,
    };

    before(async function () {
      testStartTime = new Date();
      logSection("CAS B — add_job 165888 ex=2 (TERRAZZO GRIS × 2, visuel2 vide)");
      await clearAllJobs();
      addResp = await postJson("/add_job", PAYLOAD_B);
      console.log(`\n  add_job status : ${addResp.status}`);
      if (addResp.body?.object) {
        const o = addResp.body.object;
        console.log(`  cmd         : ${o.cmd}`);
        console.log(`  ex          : ${o.ex}`);
        console.log(`  ref         : ${o.ref}`);
        console.log(`  ref2        : ${o.ref2}`);
        console.log(`  visuel      : ${o.visuel}`);
        console.log(`  visuel2     : ${o.visuel2}`);
        console.log(`  visuPath    : ${o.visuPath}`);
        console.log(`  visuPath2   : ${o.visuPath2}   ← doit = visuPath`);
        console.log(`  writePath   : ${o.writePath}`);
        console.log(`  jpgName     : ${o.jpgName}`);
      } else {
        console.log(`  Erreur : ${JSON.stringify(addResp.body)}`);
        return;
      }

      if (addResp.status !== 201) return;

      writePath = addResp.body.object.writePath;
      jpgDir = resolveJpgDir(addResp.body.object.jpgName);

      logSection("CAS B — run_jobs");
      runResp = await postJson("/run_jobs", { run: true });
      console.log(`\n  run_jobs status : ${runResp.status}`);
      await wait(15000);

      console.log(`\n  Fichiers dans writePath (${writePath}) :`);
      findFilesInDir(writePath, ".pdf")
        .filter((f) => f.startsWith("165888"))
        .forEach((f) => {
          const stat = fs.statSync(path.join(writePath, f));
          console.log(`    📄 ${f}  (${stat.size} octets)`);
        });

      console.log(`\n  Fichiers JPG dans ${jpgDir} :`);
      findFilesInDir(jpgDir, ".jpg")
        .filter((f) => f.startsWith("165888"))
        .forEach((f) => {
          const stat = fs.statSync(path.join(jpgDir, f));
          console.log(`    🖼  ${f}  (${stat.size} octets)`);
        });
    });

    // ── add_job ──────────────────────────────────────────────────────────────
    it("add_job retourne 201 (pas de rejet malgré visuel2 vide)", () =>
      expect(addResp.status).to.equal(201));
    it("ex = 2", () => expect(addResp.body.object.ex).to.equal(2));
    it("visuPath2 = visuPath (même visuel dupliqué par le backend)", () =>
      expect(addResp.body.object.visuPath2).to.equal(addResp.body.object.visuPath));
    it("ref = EAN-13 TERRAZZO GRIS (3664712481068)", () =>
      expect(String(addResp.body.object.ref)).to.equal("3664712481068"));
    it("ref2 = ref (même référence)", () =>
      expect(String(addResp.body.object.ref2)).to.equal(String(addResp.body.object.ref)));

    // ── run_jobs — fichiers disque ────────────────────────────────────────────
    it("run_jobs retourne 200", () => {
      if (!runResp) this.skip();
      expect(runResp.status).to.equal(200);
    });
    it("PDF généré dans writePath (même visuel × 2)", () => {
      if (!writePath) this.skip();
      const pdfs = findFilesInDir(writePath, ".pdf").filter((f) => f.startsWith("165888"));
      expect(pdfs.length,
        `Aucun PDF trouvé dans ${writePath}`
      ).to.be.greaterThan(0);
    });
    it("PDF non vide (taille > 0)", () => {
      if (!writePath) this.skip();
      const pdfs = findFilesInDir(writePath, ".pdf").filter((f) => f.startsWith("165888"));
      expect(pdfs.length, "Aucun PDF").to.be.greaterThan(0);
      expect(fs.statSync(path.join(writePath, pdfs[0])).size).to.be.greaterThan(0);
    });
    it("JPG généré et non vide", () => {
      if (!jpgDir) this.skip();
      const jpgs = findFilesInDir(jpgDir, ".jpg").filter((f) => f.startsWith("165888"));
      expect(jpgs.length,
        `Aucun JPG trouvé dans ${jpgDir}`
      ).to.be.greaterThan(0);
      expect(fs.statSync(path.join(jpgDir, jpgs[0])).size).to.be.greaterThan(0);
    });

    // ── MongoDB ───────────────────────────────────────────────────────────────
    it("1 seule entrée Deco créée ce run pour cmd=165888 (pas de doublon, ex=2)", async () => {
      if (!writePath) this.skip();
      const r = await httpGet("/history?limit=20");
      expect(r.status).to.equal(200);
      const entries = r.body?.data || [];
      // Filtrer uniquement les entrées créées PENDANT ce test (par date)
      const thisRun = entries.filter(
        (e) => e.numCmd === 165888 && new Date(e.date) >= testStartTime,
      );
      console.log(`\n  MongoDB /history (${entries.length} entrées récentes) :`);
      entries.slice(0, 5).forEach((e) => {
        console.log(`    cmd=${e.numCmd} | deco="${e.deco}" | ref=${e.ref} | format=${e.format} | ex=${e.ex} | date=${e.date}`);
      });
      console.log(`\n  Entrées de CE run pour cmd=165888 : ${thisRun.length}`);
      expect(thisRun.length,
        `Attendu exactement 1 entrée pour ce run (visuel dupliqué ne doit pas créer de doublon) : ${JSON.stringify(thisRun)}`
      ).to.equal(1);
      const entry = thisRun[0];
      expect(entry.ex, "ex doit être 2").to.equal(2);
      expect(String(entry.ref)).to.equal("3664712481068");
      expect(entry.format).to.equal("300x60");
      expect(entry.deco, "deco ne doit pas être vide").to.be.ok;
    });
  });
});
