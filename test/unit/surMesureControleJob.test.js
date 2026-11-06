const { expect } = require("chai");
const { refusJobSurMesure } = require("../../server/src/surMesure/controleJob");

const panneau = (extra = {}) => ({ nom: "169548-1 LM LE MANS Onyx", largeur: 800, hauteur: 2100, ecarts: [], ...extra });
const controle = (p, extra = {}) =>
  refusJobSurMesure({ panneau: p, formatTauro: "101x215", decoupeSM: "./server/public/DECOUPESM", jobs: [], ...extra });

const ECART = { type: "dimensions", message: "80 cm dans le PDF, 100 cm dans Gamesys", bloquant: false };

describe("surMesure/controleJob", () => {
  it("laisse passer un panneau conforme", () => {
    expect(controle(panneau())).to.equal(null);
  });

  it("refuse tant que le dossier de découpe n'est pas configuré", () => {
    expect(controle(panneau(), { decoupeSM: "" }).code).to.equal("SM_DECOUPE_NON_CONFIGUREE");
  });

  it("exige la confirmation d'un écart", () => {
    expect(controle(panneau({ ecarts: [ECART] })).code).to.equal("SM_ECART_NON_CONFIRME");
    expect(controle(panneau({ ecarts: [ECART], ecartsConfirmes: true }))).to.equal(null);
  });

  it("refuse un écart bloquant même confirmé", () => {
    const ecarts = [{ type: "sens", message: "plus large que haut", bloquant: true }];
    expect(controle(panneau({ ecarts, ecartsConfirmes: true })).code).to.equal("SM_BLOQUE");
  });

  it("revérifie la plaque choisie par l'opérateur", () => {
    const p = panneau({ largeur: 1200, ecarts: [{ type: "plaque", message: "trop grand", bloquant: true }] });
    expect(controle(p).code).to.equal("SM_PLAQUE_TROP_PETITE");
    expect(controle(p, { formatTauro: "126x260" })).to.equal(null);
  });

  it("refuse deux panneaux différents au même QR, pas le même panneau", () => {
    const jobs = [{ smNom: "169548-1 LM LE MANS Onyx autre nom" }];
    expect(controle(panneau(), { jobs }).code).to.equal("SM_QR_DOUBLON");
    expect(controle(panneau(), { jobs: [{ smNom: panneau().nom }] })).to.equal(null);
  });
});
