/**
 * Tests d'intégration — Crédences CASTO et BRICO
 *
 * Couvre :
 *   1. normalizeDossierApiPayload   — détection du format crédence (tests unitaires, sans serveur)
 *   2. CASTO 300x60 — 1 visuel seul   (add_job + run_jobs, PDF généré)
 *   3. CASTO 300x60 — amalgame 2 visuels (PDF " + ", JPG " + ")
 *   4. BRICO 255x60 — amalgame 2 visuels (PDF " + ", JPG " + ")
 *
 * Prérequis pour les sections 2–4 : serveur lancé sur localhost:8000 (npm run server)
 */
const { expect } = require("chai");
const http = require("http");
const fs = require("fs");
const path = require("path");

// Chargement optionnel : requiert odbc (pilote natif), absent sur certaines machines
let normalizeDossierApiPayload;
try {
  ({ normalizeDossierApiPayload } = require("../../server/src/controllers/dossierApiController"));
} catch (_) {
  normalizeDossierApiPayload = null;
}

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

function resolveJpgDir(jpgName) {
  // jpgName = "public/PRINTSA#session/fileName.jpg" → dossier PRINTSA
  return path.join(PROJECT_ROOT, "server", path.dirname(jpgName));
}

function cleanByPrefix(dir, prefix) {
  if (!dir || !fs.existsSync(dir)) return;
  try {
    fs.readdirSync(dir)
      .filter((f) => f.startsWith(String(prefix)))
      .forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch (_) {} });
  } catch (_) {}
}

function findFilesInDir(dir, suffix) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(suffix));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Crédences CASTO et BRICO — exécution complète", function () {

  // ════════════════════════════════════════════════════════════════════════════
  // 1. normalizeDossierApiPayload — détection du format crédence (unitaire)
  // ════════════════════════════════════════════════════════════════════════════

  describe("normalizeDossierApiPayload — format crédence", function () {
    before(function () {
      if (!normalizeDossierApiPayload) this.skip();
    });

    it("1 visual 300x60 → formatVisu='300x60', formatTauro='150x305'", () => {
      const payload = {
        numero: "165888",
        clientName: "CASTO",
        sousDossiers: [{
          sousNumero: "01",
          commande: "165888/01",
          dossier: { dos_imp_1_ele: "300x60", dos_supp_1_ft_imp: "150x305" },
          visualReferences: [{
            reference: "3664712481068",
            libelle: "CRED 300x60cm TERRAZZO GRIS MAT",
          }],
          livraison: [{ bo_ville: "LOCMARIA-PLOUZANE" }],
          enteteDevis: [{ endv_quant: 1 }],
        }],
      };
      const result = normalizeDossierApiPayload(payload);
      expect(result.visualJobs).to.have.length(1);
      expect(result.visualJobs[0].formatVisu).to.equal("300x60");
      expect(result.visualJobs[0].formatTauro).to.equal("150x305");
      expect(result.visualJobs[0].reference).to.equal("3664712481068");
      expect(result.visualJobs[0].ville).to.equal("LOCMARIA-PLOUZANE");
    });

    it("2 visuals 300x60 dans le même sous-dossier → 2 jobs crédences", () => {
      const payload = {
        numero: "165888",
        clientName: "CASTO",
        sousDossiers: [{
          sousNumero: "01",
          commande: "165888/01",
          dossier: { dos_imp_1_ele: "300x60", dos_supp_1_ft_imp: "150x305" },
          visualReferences: [
            { reference: "3664712481068", libelle: "CRED 300x60cm TERRAZZO GRIS MAT" },
            { reference: "3664711433747", libelle: "CRED 300x60cm BETON CLAIR MAT" },
          ],
          livraison: [{ bo_ville: "LOCMARIA-PLOUZANE" }],
          enteteDevis: [{ endv_quant: 1 }],
        }],
      };
      const result = normalizeDossierApiPayload(payload);
      expect(result.visualJobs).to.have.length(2);
      result.visualJobs.forEach((j) => expect(j.formatVisu).to.equal("300x60"));
      expect(result.visualJobs.map((j) => j.reference)).to.include.members([
        "3664712481068",
        "3664711433747",
      ]);
    });

    it("format libellé en mm (3000x600) → normalisé '300x60'", () => {
      const payload = {
        numero: "165888",
        clientName: "CASTO",
        sousDossiers: [{
          sousNumero: "01",
          commande: "165888/01",
          dossier: { dos_supp_1_ft_imp: "150x305" },
          visualReferences: [{ reference: "3664712481068", libelle: "CRED 3000x600mm TERRAZZO" }],
          livraison: [{ bo_ville: "BORDEAUX" }],
          enteteDevis: [{ endv_quant: 1 }],
        }],
      };
      const result = normalizeDossierApiPayload(payload);
      expect(result.visualJobs[0].formatVisu).to.equal("300x60");
    });

    it("BRICO 255x60 → formatVisu='255x60'", () => {
      const payload = {
        numero: "165520",
        clientName: "BRICO",
        sousDossiers: [{
          sousNumero: "01",
          commande: "165520/01",
          dossier: { dos_imp_1_ele: "255x60", dos_supp_1_ft_imp: "150x305" },
          visualReferences: [{ reference: "CALACA-25560", libelle: "CALACATTA BRILLANT 255x60" }],
          livraison: [{ bo_ville: "LA FLECHE" }],
          enteteDevis: [{ endv_quant: 1 }],
        }],
      };
      const result = normalizeDossierApiPayload(payload);
      expect(result.visualJobs[0].formatVisu).to.equal("255x60");
      expect(result.visualJobs[0].formatTauro).to.equal("150x305");
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. CASTO — crédence 300x60 — 1 visuel seul → REJETÉ (400)
  //    Règle : les crédences BRICO/CASTO doivent toujours être amalgamées
  // ════════════════════════════════════════════════════════════════════════════

  describe("CASTO crédence 300x60 — 1 visuel sans partenaire → rejeté 400", function () {
    this.timeout(10000);

    let addResp;

    const PAYLOAD = {
      client: "CASTO",
      numCmd: "165675",
      numCmd2: 0,
      ville: "Miradoux",
      ex: 1,
      teinteMasse: false,
      prodBlanc: false,
      visuel: "server/public/CASTO/2_300x60/CRED 300x60cm MOSAIQUE 3664711694254 MAT.pdf",
      format: "server/public/CASTO/2_300x60/",
      visuel2: "",
      format2: "",
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
      await clearAllJobs();
    });

    it("add_job retourne 400 (crédence sans 2e visuel)", () =>
      expect(addResp.status).to.equal(400));
    it("message d'erreur contient 'amalgamées'", () =>
      expect(addResp.body.error).to.include("amalgamées"));
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 3. CASTO 165675 — crédence 300x60 — amalgame 2 visuels
  //    MOSAIQUE (165675/00) + MARBRE BLANC (165675/00, même dossier)
  // ════════════════════════════════════════════════════════════════════════════

  describe("Dossier 165675 — CASTO crédence 300x60 — amalgame 2 visuels (MOSAIQUE + MARBRE BLANC)", function () {
    this.timeout(60000);

    let addResp;
    let writePath, jpgDir;

    const PAYLOAD = {
      client: "CASTO",
      numCmd:  "165675",
      numCmd2: "165675",
      ville: "Miradoux",
      ex: 1,
      teinteMasse: false,
      prodBlanc: false,
      visuel:  "server/public/CASTO/2_300x60/CRED 300x60cm MOSAIQUE 3664711694254 MAT.pdf",
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
      await clearAllJobs();
      addResp = await postJson("/add_job", PAYLOAD);
      expect(addResp.status, "add_job doit retourner 201").to.equal(201);
      writePath = addResp.body.object.writePath;
      jpgDir = resolveJpgDir(addResp.body.object.jpgName);
      cleanByPrefix(writePath, "165675");
      cleanByPrefix(jpgDir, "165675");
      await postJson("/run_jobs", { run: true });
      await wait(8000);
    });

    after(async function () {
      await clearAllJobs();
      cleanByPrefix(writePath, "165675");
      cleanByPrefix(jpgDir, "165675");
    });

    it("add_job retourne 201", () => expect(addResp.status).to.equal(201));
    it("client = CASTO", () => expect(addResp.body.object.client).to.equal("CASTO"));
    it("ville = MIRADOUX", () => expect(addResp.body.object.ville).to.equal("MIRADOUX"));
    it("format_visu = 300x60 (crédence)", () => expect(addResp.body.object.format_visu).to.equal("300x60"));
    it("format_Plaque = 150x305", () => expect(addResp.body.object.format_Plaque).to.equal("150x305"));
    it("ref = EAN-13 visuel 1 (MOSAIQUE : 3664711694254)", () =>
      expect(String(addResp.body.object.ref)).to.equal("3664711694254"));
    it("ref2 = EAN-13 visuel 2 (MARBRE BLANC : 3664714023259)", () =>
      expect(String(addResp.body.object.ref2)).to.equal("3664714023259"));
    it("visuPath contient MOSAIQUE", () => expect(addResp.body.object.visuPath).to.include("MOSAIQUE"));
    it("visuPath2 contient MARBRE BLANC", () => expect(addResp.body.object.visuPath2).to.include("MARBRE BLANC"));
    it("cmd = 165675", () => expect(addResp.body.object.cmd).to.equal(165675));
    it("cmd2 = 165675 (même dossier)", () => expect(addResp.body.object.cmd2).to.equal(165675));
    it("writePath contient Deco_Std_150x305", () =>
      expect(addResp.body.object.writePath).to.include("Deco_Std_150x305"));
    it("PDF amalgamé généré dans writePath (avec ' + ' dans le nom)", () => {
      const pdfs = findFilesInDir(writePath, ".pdf");
      const amalgame = pdfs.find((f) => f.includes(" + "));
      expect(
        amalgame,
        `Aucun PDF amalgamé trouvé dans ${writePath}.\nFichiers : ${pdfs.join(", ") || "(vide)"}`,
      ).to.be.ok;
      expect(fs.existsSync(path.join(writePath, amalgame))).to.be.true;
    });
    it("JPG amalgamé généré dans le dossier PRINTSA (avec ' + ' dans le nom)", () => {
      const jpgs = findFilesInDir(jpgDir, ".jpg");
      const amalgame = jpgs.find((f) => f.includes(" + "));
      expect(
        amalgame,
        `Aucun JPG amalgamé trouvé dans ${jpgDir}.\nFichiers : ${jpgs.join(", ") || "(vide)"}`,
      ).to.be.ok;
      expect(fs.existsSync(path.join(jpgDir, amalgame))).to.be.true;
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 4. BRICO 164927 — crédence 255x60 — amalgame 2 visuels (VELTIS + TERRAZZO VULCANO)
  //
  // Dossier réel : 164927 — VITRY LE FRANCOIS — contient 3 crédences 255x60 :
  //   164927/02 VELTIS-25560, 164927/03 VULCAN-25560, 164927/04 BETCAR-25560
  // Test : pairing 164927/02 + 164927/03 (même numCmd, sous-commandes différentes)
  // ════════════════════════════════════════════════════════════════════════════

  describe("Dossier 164927 — BRICO crédence 255x60 — amalgame 2 visuels (VELTIS + TERRAZZO VULCANO)", function () {
    this.timeout(60000);

    let addResp;
    let writePath, jpgDir;

    const PAYLOAD = {
      client: "BRICO",
      numCmd:  "164927",
      numCmd2: "164927",
      ville: "VITRY LE FRANCOIS",
      ex: 1,
      teinteMasse: false,
      prodBlanc: false,
      visuel:  "server/public/BRICO/255x60/VELTIS BRILLANT 255x60 VELTIS-25560.pdf",
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
      await clearAllJobs();
      addResp = await postJson("/add_job", PAYLOAD);
      expect(addResp.status, "add_job doit retourner 201").to.equal(201);
      writePath = addResp.body.object.writePath;
      jpgDir = resolveJpgDir(addResp.body.object.jpgName);
      cleanByPrefix(writePath, "164927");
      cleanByPrefix(jpgDir, "164927");
      await postJson("/run_jobs", { run: true });
      await wait(8000);
    });

    after(async function () {
      await clearAllJobs();
      cleanByPrefix(writePath, "164927");
      cleanByPrefix(jpgDir, "164927");
    });

    it("add_job retourne 201", () => expect(addResp.status).to.equal(201));
    it("client = BRICO", () => expect(addResp.body.object.client).to.equal("BRICO"));
    it("ville = VITRY LE FRANCOIS", () => expect(addResp.body.object.ville).to.equal("VITRY LE FRANCOIS"));
    it("format_visu = 255x60 (crédence BRICO)", () => expect(addResp.body.object.format_visu).to.equal("255x60"));
    it("format_Plaque = 126x260", () => expect(addResp.body.object.format_Plaque).to.equal("126x260"));
    it("teinteMasse = false", () => expect(addResp.body.object.teinteMasse).to.be.false);
    it("ref = VELTIS-25560 (visuel 1)", () => expect(addResp.body.object.ref).to.equal("VELTIS-25560"));
    it("ref2 = VULCAN-25560 (visuel 2)", () => expect(addResp.body.object.ref2).to.equal("VULCAN-25560"));
    it("visuPath contient VELTIS", () => expect(addResp.body.object.visuPath).to.include("VELTIS"));
    it("visuPath2 contient VULCANO", () => expect(addResp.body.object.visuPath2).to.include("VULCANO"));
    it("cmd = 164927", () => expect(addResp.body.object.cmd).to.equal(164927));
    it("cmd2 = 164927 (même dossier, sous-commande différente)", () =>
      expect(addResp.body.object.cmd2).to.equal(164927));
    it("writePath contient Deco_Std_126x260", () =>
      expect(addResp.body.object.writePath).to.include("Deco_Std_126x260"));
    it("PDF amalgamé généré dans writePath (avec ' + ' dans le nom)", () => {
      const pdfs = findFilesInDir(writePath, ".pdf");
      const amalgame = pdfs.find((f) => f.includes(" + "));
      expect(
        amalgame,
        `Aucun PDF amalgamé trouvé dans ${writePath}.\nFichiers : ${pdfs.join(", ") || "(vide)"}`,
      ).to.be.ok;
      expect(fs.existsSync(path.join(writePath, amalgame))).to.be.true;
    });
    it("JPG amalgamé généré dans le dossier PRINTSA (avec ' + ' dans le nom)", () => {
      const jpgs = findFilesInDir(jpgDir, ".jpg");
      const amalgame = jpgs.find((f) => f.includes(" + "));
      expect(
        amalgame,
        `Aucun JPG amalgamé trouvé dans ${jpgDir}.\nFichiers : ${jpgs.join(", ") || "(vide)"}`,
      ).to.be.ok;
      expect(fs.existsSync(path.join(jpgDir, amalgame))).to.be.true;
    });
  });
});
