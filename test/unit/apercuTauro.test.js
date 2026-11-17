const assert = require("node:assert/strict");
const {
  motifCourt,
  regrouperParMotif,
  listeDossiers,
  blocageCourt,
  resumeFormats,
  erreurTaille,
  TAILLE_DEFAUT,
} = require("../../client/src/utils/apercuTauro.js");

describe("aperçu sessions Tauro : textes courts", () => {
  it("motifCourt retire la finition en tête et la consigne finale", () => {
    // Le nombre d'ex. est affiché à part : le motif ne le répète pas
    assert.equal(
      motifCourt(
        "MAT : 20 ex. restants, pas de quoi faire une session de 50 ex. — non lancé, à relancer par l'opérateur",
      ),
      "pas de quoi faire une session de 50 ex.",
    );
    assert.equal(
      motifCourt(
        "BRI : 14 ex. restants (minimum 20 pour une session Brillant) — non lancé, à relancer par l'opérateur ou hors session",
      ),
      "minimum 20 pour une session Brillant",
    );
    assert.equal(
      motifCourt("MAT : seulement 28 ex. (une session Mat = 50 ex.) — non lancé"),
      "une session Mat = 50 ex.",
    );
    assert.equal(
      motifCourt("MAT : plaque de 60 ex., plus qu'une session de 50 ex. — non lancé, à voir par l'opérateur"),
      "plaque de 60 ex., plus qu'une session de 50 ex.",
    );
  });

  it("regrouperParMotif : une ligne par motif, avec ex. et jobs cumulés", () => {
    const groupes = regrouperParMotif([
      { cmd: "169855", ex: 1, raison: "MAT : 3 ex. restants, pas de quoi faire une session de 50 ex. — non lancé" },
      { cmd: "169855", ex: 1, raison: "MAT : 3 ex. restants, pas de quoi faire une session de 50 ex. — non lancé" },
      { cmd: "169856", ex: 1, raison: "MAT : 3 ex. restants, pas de quoi faire une session de 50 ex. — non lancé" },
    ]);
    assert.equal(groupes.length, 1);
    assert.equal(groupes[0].motif, "pas de quoi faire une session de 50 ex.");
    assert.equal(groupes[0].ex, 3);
    assert.equal(groupes[0].jobs, 3);
    assert.equal(groupes[0].dossiers, "169855 (2), 169856 (1)");
  });

  it("listeDossiers cumule les ex. par commande, dans l'ordre d'apparition", () => {
    assert.equal(
      listeDossiers([
        { cmd: "2", ex: 1 },
        { cmd: "1", ex: 2 },
        { cmd: "2", ex: 3 },
      ]),
      "2 (4), 1 (2)",
    );
  });

  it("blocageCourt : déjà lancé en session, hors session, modifié, autre motif", () => {
    assert.equal(
      blocageCourt(
        "déjà lancé le 17/11/2026 (002_S1711A_101x215_MAT_164771_HOKUSAI-DROIT-100x210_20) — identique : à confirmer (relancer 164771/01)",
      ),
      "déjà lancé le 17/11/2026 (S1711A n° 002), identique",
    );
    assert.equal(
      blocageCourt(
        "déjà lancé le 17/11/2026 (165888 CASTO X 1_EX + 165888 Y 1_EX) — MODIFIÉ depuis : ex. 1 → 3 : à confirmer (relancer 165888/02)",
      ),
      "déjà lancé le 17/11/2026 (hors session), modifié depuis : ex. 1 → 3",
    );
    assert.equal(
      blocageCourt("en double dans l'export (1/01) — supprimer l'un des deux"),
      "en double dans l'export (1/01) — supprimer l'un des deux",
    );
  });

  it("erreurTaille : entiers de 1 à 100, min ≤ max (mêmes règles que le serveur)", () => {
    assert.equal(erreurTaille(TAILLE_DEFAUT), null);
    assert.deepEqual(TAILLE_DEFAUT, { exMat: 50, minBrillant: 20, maxBrillant: 60 });
    assert.match(erreurTaille({ ...TAILLE_DEFAUT, exMat: "" }), /nombre entier de 1 à 100/);
    assert.match(erreurTaille({ ...TAILLE_DEFAUT, exMat: 0 }), /nombre entier de 1 à 100/);
    assert.match(erreurTaille({ ...TAILLE_DEFAUT, maxBrillant: 101 }), /nombre entier de 1 à 100/);
    assert.match(erreurTaille({ ...TAILLE_DEFAUT, minBrillant: 40, maxBrillant: 30 }), /minimum.*maximum/);
  });

  it("resumeFormats : formats dans l'ordre d'impression (n° du nom), PDF avec blanc", () => {
    const jobs = [
      { nom: "003_S1711A_126x260_W_MAT_1_A_1", format: "126x260", blanc: "W" },
      { nom: "001_S1711A_151x260_MAT_1_A_1", format: "151x260", blanc: "N" },
      { nom: "004_S1711A_101x215_MAT_1_A_1", format: "101x215", blanc: "N" },
      { nom: "002_S1711A_151x260_W_MAT_1_A_1", format: "151x260", blanc: "W" },
    ];
    assert.equal(resumeFormats(jobs), "151x260 → 126x260 → 101x215 · 2 avec blanc");
    assert.equal(resumeFormats([{ format: "126x260", blanc: "N" }]), "126x260 · sans blanc");
  });
});
