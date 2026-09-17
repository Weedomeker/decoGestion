/**
 * Tests d'intégration — Détection des teintes masse via dossier API
 * Prérequis : serveur lancé sur localhost:9000 (npm run server)
 */

const { expect } = require("chai");
const http = require("http");
const { detectTeinteMasse } = require("../helpers/teinteMasse.cjs");

const HOST = "127.0.0.1";
const PORT = process.env.PORT || 9000;

// ─── Cas de test réels ────────────────────────────────────────────────────────
// Chaque entrée décrit les jobs teinte masse attendus dans le dossier.
// `libelleContient` : fragment du libellé retourné par l'API (pour identifier le job)
// `expectedTeinte`  : valeur que doit retourner detectTeinteMasse()

const TEST_CASES = [
  // ── ALU BROSSÉ — détection via accent normalisé ───────────────────────────
  {
    numero: "165816",
    description: "LM — ALU BROSSÉ 125x210cm",
    jobs: [{ libelleContient: "ALU", expectedTeinte: "ALU BROSSE" }],
  },
  {
    numero: "165673",
    description: "ECOM — ALU BROSSÉ 100x210cm",
    jobs: [{ libelleContient: "ALU", expectedTeinte: "ALU BROSSE" }],
  },
  {
    numero: "165191",
    description: "ECOM — ALU BROSSÉ + visuel classique",
    jobs: [
      { libelleContient: "ALU",  expectedTeinte: "ALU BROSSE" },
      { libelleContient: "U663", expectedTeinte: null },
    ],
  },
  {
    numero: "164760",
    description: "LM — ALU BROSSÉ 100x255 + 150x255",
    jobs: [
      { libelleContient: "ALU BROSS", expectedTeinte: "ALU BROSSE" },
    ],
  },

  // ── NOIR / BLANC ZÉRO — libellé sans "MAT" (bug corrigé) ─────────────────
  {
    numero: "101921",
    description: "LM — NOIR ZÉRO 100x255cm + visuel classique",
    jobs: [
      { libelleContient: "ALAGOAS", expectedTeinte: null },
      { libelleContient: "NOIR",    expectedTeinte: "NOIR ZERO MAT" },
    ],
  },
  {
    numero: "163942",
    description: "LM — BLANC ZÉRO 100x210cm",
    jobs: [{ libelleContient: "BLANC", expectedTeinte: "BLANC ZERO MAT" }],
  },
  {
    numero: "163886",
    description: "LM — BLANC ZÉRO 100x255cm",
    jobs: [{ libelleContient: "BLANC", expectedTeinte: "BLANC ZERO MAT" }],
  },
  {
    numero: "102240",
    description: "LM — BLANC ZÉRO 100x255 + 150x255",
    jobs: [{ libelleContient: "BLANC", expectedTeinte: "BLANC ZERO MAT" }],
  },

  // ── Dossiers sans teinte masse ────────────────────────────────────────────
  {
    numero: "10220",
    description: "LM — KAOLIN SAUGE (pas de teinte masse)",
    jobs: [{ libelleContient: "KAOLIN", expectedTeinte: null }],
  },
];

// ─── Helper HTTP ──────────────────────────────────────────────────────────────

function fetchDossierApi(numero) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${HOST}:${PORT}/dossier-api/${numero}`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} pour le dossier ${numero}`));
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Réponse non-JSON pour ${numero}`)); }
      });
    });
    req.on("error", (e) =>
      reject(new Error(`Serveur inaccessible sur ${HOST}:${PORT} — lancez 'npm run server'. (${e.message})`))
    );
    req.setTimeout(20000, () => { req.destroy(); reject(new Error(`Timeout dossier ${numero}`)); });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Dossier API — détection des teintes masse (intégration live)", function () {
  this.timeout(30000);

  TEST_CASES.forEach(({ numero, description, jobs: expectedJobs }) => {
    describe(`Dossier ${numero} — ${description}`, () => {
      let apiResponse;

      before(async () => {
        apiResponse = await fetchDossierApi(numero);
      });

      it("l'API retourne des visualJobs", () => {
        expect(apiResponse).to.have.property("visualJobs").that.is.an("array");
        expect(apiResponse.visualJobs.length).to.be.greaterThan(
          0,
          `Dossier ${numero} sans visualJobs — vérifier qu'il existe et contient des visuels`
        );
      });

      expectedJobs.forEach(({ libelleContient, expectedTeinte }) => {
        it(`job "${libelleContient}" → ${JSON.stringify(expectedTeinte)}`, () => {
          const matching = (apiResponse.visualJobs || []).filter((j) =>
            (j.libelle || "").toUpperCase().includes(libelleContient.toUpperCase())
          );

          expect(matching.length).to.be.greaterThan(
            0,
            `Aucun job avec libellé contenant "${libelleContient}" dans ${numero}.\n` +
            `Libellés disponibles : ${(apiResponse.visualJobs || []).map((j) => j.libelle).join(" | ")}`
          );

          matching.forEach((job) => {
            const detected = detectTeinteMasse(job);
            expect(detected).to.equal(
              expectedTeinte,
              `Dossier ${numero} — libellé="${job.libelle}" ref="${job.reference}"\n` +
              `  → detectTeinteMasse = ${JSON.stringify(detected)}\n` +
              `  → attendu           = ${JSON.stringify(expectedTeinte)}`
            );
          });
        });
      });
    });
  });

  // ─── Anti-régression : dossier ECOM sans teinte masse ─────────────────────
  describe("Dossier 164771 — ECOM Stéphane Corler (anti-régression)", () => {
    let apiResponse;

    before(async () => {
      apiResponse = await fetchDossierApi("164771");
    });

    it("retourne des visualJobs", () => {
      expect(apiResponse.visualJobs).to.have.length.greaterThan(0);
    });

    it("aucun faux positif de teinte masse", () => {
      (apiResponse.visualJobs || []).forEach((job) => {
        expect(detectTeinteMasse(job)).to.be.null,
          `Faux positif : "${job.libelle}" détecté comme teinte masse`;
      });
    });
  });
});
