/**
 * Test manuel — Dossier 164886 — BRICO crédence 255x60
 * Vérifie le process complet : add_job → run_jobs → fichiers disque → MongoDB
 *
 * ⚠️  Les fichiers de sortie NE sont PAS supprimés après le test.
 *     Vérifier manuellement dans writePath et le dossier PRINTSA.
 *
 * API dossier : { client:"BM", ville:"ETALONDES", ex:1, ref:"AURALY-25560",
 *                 libelle:"MARBRE AURALYS 255x60", formatTauro:"126x260" }
 *
 * Prérequis : serveur lancé sur localhost:8000 (npm run server)
 * Lancer   : npx mocha test/integration/test164886.js --timeout 120000
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

describe("Dossier 164886 — BRICO crédence 255x60 — process complet", function () {

  // ════════════════════════════════════════════════════════════════════════════
  // CAS A : ex=1 — MARBRE AURALYS + TERRAZZO VULCANO (2 visuels différents)
  // ════════════════════════════════════════════════════════════════════════════

  describe("CAS A — ex=1 — MARBRE AURALYS + TERRAZZO VULCANO (visuels différents)", function () {
    this.timeout(120000);

    let addResp, runResp;
    let writePath, jpgDir;
    let testStartTime;

    const PAYLOAD_A = {
      client: "BRICO",
      numCmd: "164886",
      numCmd2: "164886",
      ville: "ETALONDES",
      ex: 1,
      teinteMasse: false,
      prodBlanc: false,
      visuel:  "server/public/BRICO/255x60/MARBRE AURALYS BRILLANT 255x60 AURALY-25560.pdf",
      format:  "server/public/BRICO/255x60/",
      visuel2: "server/public/BRICO/255x60/TERRAZZO VULCANO BRILLANT 255x60 VULCAN-25560.pdf",
      format2: "server/public/BRICO/255x60/",
      formatTauro: "Deco_Std_126x260",
      allFormatTauro: TAURO_FORMATS,
      perte: null,
      regmarks: false,
      cut: false,
      stock: false,
    };

    before(async function () {
      testStartTime = new Date();
      logSection("CAS A — add_job 164886 ex=1 (MARBRE AURALYS + TERRAZZO VULCANO)");
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
        .filter((f) => f.startsWith("164886"))
        .forEach((f) => {
          const stat = fs.statSync(path.join(writePath, f));
          console.log(`    📄 ${f}  (${stat.size} octets)`);
        });

      console.log(`\n  Fichiers JPG dans ${jpgDir} :`);
      findFilesInDir(jpgDir, ".jpg")
        .filter((f) => f.startsWith("164886"))
        .forEach((f) => {
          const stat = fs.statSync(path.join(jpgDir, f));
          console.log(`    🖼  ${f}  (${stat.size} octets)`);
        });
    });

    // ── add_job ──────────────────────────────────────────────────────────────
    it("add_job retourne 201", () => expect(addResp.status).to.equal(201));
    it("client = BRICO", () => expect(addResp.body.object.client).to.equal("BRICO"));
    it("format_visu = 255x60", () => expect(addResp.body.object.format_visu).to.equal("255x60"));
    it("format_Plaque = 126x260", () => expect(addResp.body.object.format_Plaque).to.equal("126x260"));
    it("ref = AURALY-25560 (MARBRE AURALYS)", () =>
      expect(String(addResp.body.object.ref)).to.equal("AURALY-25560"));
    it("ref2 = VULCAN-25560 (TERRAZZO VULCANO)", () =>
      expect(String(addResp.body.object.ref2)).to.equal("VULCAN-25560"));
    it("visuPath contient MARBRE AURALYS", () =>
      expect(addResp.body.object.visuPath).to.include("MARBRE AURALYS"));
    it("visuPath2 contient TERRAZZO VULCANO", () =>
      expect(addResp.body.object.visuPath2).to.include("TERRAZZO VULCANO"));
    it("visuPath2 ≠ visuPath (visuels différents)", () =>
      expect(addResp.body.object.visuPath2).to.not.equal(addResp.body.object.visuPath));
    it("ex = 1", () => expect(addResp.body.object.ex).to.equal(1));
    it("writePath contient Deco_Std_126x260", () =>
      expect(addResp.body.object.writePath).to.include("Deco_Std_126x260"));

    // ── run_jobs — fichiers disque ────────────────────────────────────────────
    it("run_jobs retourne 200", () => expect(runResp.status).to.equal(200));
    it("PDF amalgamé généré (contient ' + ')", () => {
      const pdfs = findFilesInDir(writePath, ".pdf").filter((f) => f.startsWith("164886"));
      const amalgame = pdfs.find((f) => f.includes(" + "));
      expect(amalgame,
        `Aucun PDF amalgamé trouvé dans ${writePath}.\nPDFs : ${pdfs.join(", ") || "(vide)"}`
      ).to.be.ok;
    });
    it("PDF amalgamé non vide (taille > 0)", () => {
      const pdfs = findFilesInDir(writePath, ".pdf").filter((f) => f.startsWith("164886"));
      const amalgame = pdfs.find((f) => f.includes(" + "));
      expect(amalgame, "PDF amalgamé introuvable").to.be.ok;
      expect(fs.statSync(path.join(writePath, amalgame)).size).to.be.greaterThan(0);
    });
    it("PDF contient AURALYS dans le nom", () => {
      const pdfs = findFilesInDir(writePath, ".pdf").filter((f) => f.startsWith("164886"));
      const found = pdfs.some((f) => f.toUpperCase().includes("AURALY"));
      expect(found, `Aucun PDF avec AURALY. PDFs : ${pdfs.join(", ")}`).to.be.true;
    });
    it("PDF contient VULCANO dans le nom", () => {
      const pdfs = findFilesInDir(writePath, ".pdf").filter((f) => f.startsWith("164886"));
      const found = pdfs.some((f) => f.toUpperCase().includes("VULCAN"));
      expect(found, `Aucun PDF avec VULCAN. PDFs : ${pdfs.join(", ")}`).to.be.true;
    });
    it("JPG amalgamé généré et non vide", () => {
      const jpgs = findFilesInDir(jpgDir, ".jpg").filter((f) => f.startsWith("164886"));
      const amalgame = jpgs.find((f) => f.includes(" + "));
      expect(amalgame,
        `Aucun JPG amalgamé trouvé dans ${jpgDir}.\nJPGs : ${jpgs.join(", ") || "(vide)"}`
      ).to.be.ok;
      expect(fs.statSync(path.join(jpgDir, amalgame)).size).to.be.greaterThan(0);
    });

    // ── MongoDB ───────────────────────────────────────────────────────────────
    it("2 entrées Deco créées dans MongoDB ce run (MARBRE AURALYS + TERRAZZO VULCANO)", async () => {
      const r = await httpGet("/history?limit=20");
      expect(r.status, "GET /history doit retourner 200").to.equal(200);
      const entries = r.body?.data || [];
      const thisRun = entries.filter(
        (e) => e.numCmd === 164886 && new Date(e.date) >= testStartTime,
      );
      console.log(`\n  MongoDB /history (${entries.length} entrées récentes) :`);
      entries.slice(0, 6).forEach((e) => {
        console.log(`    cmd=${e.numCmd} | deco="${e.deco}" | ref=${e.ref} | format=${e.format} | ex=${e.ex} | date=${e.date}`);
      });
      console.log(`\n  Entrées de CE run pour cmd=164886 : ${thisRun.length}`);
      expect(thisRun.length,
        `Attendu 2 entrées (MARBRE AURALYS + TERRAZZO VULCANO) : ${JSON.stringify(thisRun.map((e) => ({ deco: e.deco, ref: e.ref })))}`
      ).to.equal(2);
      const refs = thisRun.map((e) => String(e.ref));
      expect(refs, "ref AURALY-25560 attendue").to.include("AURALY-25560");
      expect(refs, "ref VULCAN-25560 attendue").to.include("VULCAN-25560");
      thisRun.forEach((e) => {
        expect(e.deco, `deco vide pour ref=${e.ref}`).to.be.ok;
        expect(e.deco, `deco ne doit pas être la référence brute`).to.not.match(/^[A-Z]+-\d+$/);
        expect(e.format, "format doit être 255x60").to.equal("255x60");
        expect(e.ex, `ex doit être 1 pour ref=${e.ref}`).to.equal(1);
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // CAS B : ex=2 — MARBRE AURALYS seul → duplication automatique
  // ════════════════════════════════════════════════════════════════════════════

  describe("CAS B — ex=2 — MARBRE AURALYS seul (duplication automatique ×2)", function () {
    this.timeout(120000);

    let addResp, runResp;
    let writePath, jpgDir;
    let testStartTime;

    const PAYLOAD_B = {
      client: "BRICO",
      numCmd: "164886",
      numCmd2: "164886",
      ville: "ETALONDES",
      ex: 2,
      teinteMasse: false,
      prodBlanc: false,
      visuel:  "server/public/BRICO/255x60/MARBRE AURALYS BRILLANT 255x60 AURALY-25560.pdf",
      format:  "server/public/BRICO/255x60/",
      visuel2: "",   // délibérément vide — le backend doit dupliquer
      format2: "",
      formatTauro: "Deco_Std_126x260",
      allFormatTauro: TAURO_FORMATS,
      perte: null,
      regmarks: false,
      cut: false,
      stock: false,
    };

    before(async function () {
      testStartTime = new Date();
      logSection("CAS B — add_job 164886 ex=2 (MARBRE AURALYS × 2, visuel2 vide)");
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
        .filter((f) => f.startsWith("164886"))
        .forEach((f) => {
          const stat = fs.statSync(path.join(writePath, f));
          console.log(`    📄 ${f}  (${stat.size} octets)`);
        });

      console.log(`\n  Fichiers JPG dans ${jpgDir} :`);
      findFilesInDir(jpgDir, ".jpg")
        .filter((f) => f.startsWith("164886"))
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
    it("ref = AURALY-25560 (MARBRE AURALYS)", () =>
      expect(String(addResp.body.object.ref)).to.equal("AURALY-25560"));
    it("ref2 = ref (même référence)", () =>
      expect(String(addResp.body.object.ref2)).to.equal(String(addResp.body.object.ref)));

    // ── run_jobs — fichiers disque ────────────────────────────────────────────
    it("run_jobs retourne 200", () => {
      if (!runResp) this.skip();
      expect(runResp.status).to.equal(200);
    });
    it("PDF généré dans writePath (même visuel × 2)", () => {
      if (!writePath) this.skip();
      const pdfs = findFilesInDir(writePath, ".pdf").filter((f) => f.startsWith("164886"));
      expect(pdfs.length,
        `Aucun PDF trouvé dans ${writePath}`
      ).to.be.greaterThan(0);
    });
    it("PDF non vide (taille > 0)", () => {
      if (!writePath) this.skip();
      const pdfs = findFilesInDir(writePath, ".pdf").filter((f) => f.startsWith("164886"));
      expect(pdfs.length, "Aucun PDF").to.be.greaterThan(0);
      expect(fs.statSync(path.join(writePath, pdfs[0])).size).to.be.greaterThan(0);
    });
    it("JPG généré et non vide", () => {
      if (!jpgDir) this.skip();
      const jpgs = findFilesInDir(jpgDir, ".jpg").filter((f) => f.startsWith("164886"));
      expect(jpgs.length,
        `Aucun JPG trouvé dans ${jpgDir}`
      ).to.be.greaterThan(0);
      expect(fs.statSync(path.join(jpgDir, jpgs[0])).size).to.be.greaterThan(0);
    });

    // ── MongoDB ───────────────────────────────────────────────────────────────
    it("1 seule entrée Deco créée ce run pour cmd=164886 (pas de doublon, ex=2)", async () => {
      if (!writePath) this.skip();
      const r = await httpGet("/history?limit=20");
      expect(r.status).to.equal(200);
      const entries = r.body?.data || [];
      const thisRun = entries.filter(
        (e) => e.numCmd === 164886 && new Date(e.date) >= testStartTime,
      );
      console.log(`\n  MongoDB /history (${entries.length} entrées récentes) :`);
      entries.slice(0, 5).forEach((e) => {
        console.log(`    cmd=${e.numCmd} | deco="${e.deco}" | ref=${e.ref} | format=${e.format} | ex=${e.ex} | date=${e.date}`);
      });
      console.log(`\n  Entrées de CE run pour cmd=164886 : ${thisRun.length}`);
      expect(thisRun.length,
        `Attendu exactement 1 entrée pour ce run (visuel dupliqué ne doit pas créer de doublon) : ${JSON.stringify(thisRun)}`
      ).to.equal(1);
      const entry = thisRun[0];
      expect(entry.ex, "ex doit être 2").to.equal(2);
      expect(String(entry.ref)).to.equal("AURALY-25560");
      expect(entry.format).to.equal("255x60");
      expect(entry.deco, "deco ne doit pas être vide").to.be.ok;
      expect(entry.deco, "deco ne doit pas être la référence brute").to.not.match(/^[A-Z]+-\d+$/);
    });
  });
});
