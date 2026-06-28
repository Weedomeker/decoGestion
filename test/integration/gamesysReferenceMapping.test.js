/**
 * Tests d'intégration — Vérification que Gamesys associe les bonnes références aux bons visuels
 * Prérequis : serveur lancé sur localhost:8000 (npm run server)
 */

const { expect } = require("chai");
const http = require("http");

const HOST = "127.0.0.1";
const PORT = 8000;

function fetchDossierApi(numero) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${HOST}:${PORT}/dossier-api/${numero}`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} pour le dossier ${numero}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Réponse non-JSON pour ${numero}`));
        }
      });
    });
    req.on("error", (e) =>
      reject(
        new Error(`Serveur inaccessible sur ${HOST}:${PORT} — lancez 'npm run server'. (${e.message})`)
      )
    );
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error(`Timeout dossier ${numero}`));
    });
  });
}

describe("Gamesys — correspondance références / visuels (intégration live)", function () {
  this.timeout(30000);

  // ── Dossier 166203 : LM BÉTON CLAIR multi-format (cas critique) ──────────────
  describe("Dossier 166203 — LM BÉTON CLAIR 100x255 + 150x255", () => {
    let api;

    before(async () => {
      api = await fetchDossierApi("166203");
    });

    it("retourne exactement 2 visualJobs", () => {
      expect(api.visualJobs).to.be.an("array");
      expect(api.visualJobs).to.have.lengthOf(2);
    });

    it("n'a aucun warning", () => {
      expect(api.warnings).to.be.an("array");
      expect(api.warnings).to.have.lengthOf(
        0,
        `Warnings inattendus : ${JSON.stringify(api.warnings)}`
      );
    });

    it("le job 100x255 a la référence correcte 94953571", () => {
      const job = api.visualJobs.find((j) => j.formatVisu === "100x255");
      expect(job, "job 100x255 introuvable").to.exist;
      expect(job.reference).to.equal(
        "94953571",
        `Référence incorrecte pour "${job.libelle}" — obtenu: "${job.reference}"`
      );
    });

    it("le job 150x255 a la référence correcte 94964348", () => {
      const job = api.visualJobs.find((j) => j.formatVisu === "150x255");
      expect(job, "job 150x255 introuvable").to.exist;
      expect(job.reference).to.equal(
        "94964348",
        `Référence incorrecte pour "${job.libelle}" — obtenu: "${job.reference}"`
      );
    });

    it("les deux références sont distinctes", () => {
      const refs = api.visualJobs.map((j) => j.reference);
      expect(new Set(refs).size).to.equal(
        2,
        `Références dupliquées ou erronées : ${JSON.stringify(refs)}`
      );
    });

    it("aucun job n'a reference === libelle (pas de fallback sur label brut)", () => {
      api.visualJobs.forEach((job) => {
        expect(job.reference).to.not.equal(
          job.libelle,
          `Fallback sur libellé brut pour "${job.libelle}"`
        );
      });
    });
  });

  // ── Anti-régression : références non-vides et distinctes ────────────────────
  describe("Dossier 165191 — ECOM multi-visuel (anti-régression)", () => {
    let api;

    before(async () => {
      api = await fetchDossierApi("165191");
    });

    it("retourne au moins 2 visualJobs", () => {
      expect(api.visualJobs.length).to.be.greaterThanOrEqual(2);
    });

    it("chaque job a une référence non-vide et non égale à son libellé", () => {
      api.visualJobs.forEach((job) => {
        expect(job.reference, `reference manquante pour "${job.libelle}"`).to.be.a("string").and.not.empty;
        expect(job.reference).to.not.equal(
          job.libelle,
          `Fallback brut pour "${job.libelle}"`
        );
      });
    });

    it("les références des différents jobs sont distinctes", () => {
      const refs = api.visualJobs.map((j) => j.reference);
      expect(new Set(refs).size).to.equal(
        refs.length,
        `Références dupliquées : ${JSON.stringify(refs)}`
      );
    });
  });
});
