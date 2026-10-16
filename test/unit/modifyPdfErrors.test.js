const assert = require("assert");
const modifyPdf = require("../../server/src/app");
const amalgameCredences = require("../../server/src/amalgameCredences").modifyPdf;

// processJob enregistre la cause réelle d'un échec de génération : les deux générateurs doivent
// rejeter au lieu d'avaler l'erreur (sinon seul « PDF de sortie manquant » apparaissait).
describe("générateurs PDF — remontée des erreurs", () => {
  it("modifyPdf rejette quand le visuel source est introuvable", async () => {
    await assert.rejects(() => modifyPdf("/absent.pdf", ".", "x", "Deco_Std_101x215", true), /ENOENT/);
  });

  it("amalgameCredences rejette avec le contexte quand un visuel est introuvable", async () => {
    await assert.rejects(
      () => amalgameCredences({ visuals: [{ file: "/absent.pdf", name: "x" }], plaque: "126x260" }, "./x.pdf"),
      /Amalgame crédences impossible : ENOENT/,
    );
  });
});
