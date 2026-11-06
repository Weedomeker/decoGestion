const { expect } = require("chai");
const {
  coteDifferente,
  ecartsAConfirmer,
  estSurMesureVisuel,
  lignesVersPanneaux,
  remplacerLignes,
  statutPanneau,
} = require("../../client/src/utils/surMesure.js");

const ligne = (id, extra = {}) => ({ id, formatVisu: "100x210", formatTauroValue: "Deco_Std_101x215", ...extra });
const pdf = { nom: "169011 LM X (2)+BLANC MAT.pdf", chemin: "server/public/SM/169011.pdf" };
const panneau = (page, ligneId, ecarts = []) => ({
  page,
  ligneId,
  nom: `169011-${page + 1} LM X`,
  largeur: 800,
  hauteur: 2100,
  ex: 1,
  ecarts,
});
const ECART = { type: "dimensions", message: "écart", bloquant: false };

describe("client/utils/surMesure", () => {
  it("crée une ligne par panneau, avec le PDF et le blanc", () => {
    const rows = lignesVersPanneaux([ligne("/01")], {
      pdf,
      candidats: [pdf.nom],
      panneaux: [panneau(0, "/01"), panneau(1, "/01")],
      ecarts: [],
    });
    expect(rows.map((r) => r.id)).to.deep.equal(["/01-p0", "/01-p1"]);
    expect(rows[1].selectedFileObject.name).to.equal(pdf.chemin);
    expect(rows[0].prodBlanc).to.equal(true);
    expect(rows[0].formatPath).to.equal("100x210");
    expect(rows[0].checked).to.equal(true);
    expect(rows[0].status).to.equal("Prêt");
  });

  it("décoche un panneau avec écart et rattache les écarts globaux au premier panneau", () => {
    const global = { type: "nombre", page: null, message: "nombre", bloquant: false };
    const rows = lignesVersPanneaux([ligne("/01"), ligne("/02")], {
      pdf,
      candidats: [],
      panneaux: [panneau(0, "/01", [ECART]), panneau(1, "/02")],
      ecarts: [global],
    });
    expect(rows[0].checked).to.equal(false);
    expect(rows[0].status).to.equal("Écart à confirmer");
    expect(rows[0].smPanneau.ecarts).to.have.length(2);
    expect(rows[1].smPanneau.ecarts).to.have.length(0);
  });

  it("garde visible une ligne sans panneau", () => {
    const rows = lignesVersPanneaux([ligne("/01"), ligne("/02")], {
      pdf,
      candidats: [],
      panneaux: [panneau(0, "/01")],
      ecarts: [],
    });
    expect(rows.map((r) => r.id)).to.deep.equal(["/01-p0", "/02"]);
    expect(rows[1]).to.include({ checked: false, status: "Aucun panneau dans ce PDF", formatPath: "100x210" });
  });

  it("signale un PDF introuvable sans perdre les lignes", () => {
    const rows = lignesVersPanneaux([ligne("/01")], { pdf: null, candidats: [], panneaux: [], ecarts: [] });
    expect(rows[0]).to.include({ id: "/01", status: "PDF sur-mesure introuvable", checked: false });
  });

  it("remplace les lignes à la place de la première", () => {
    const rows = [{ id: "a" }, { id: "sm1" }, { id: "b" }, { id: "sm2" }];
    const resultat = remplacerLignes(rows, (r) => r.id.startsWith("sm"), [{ id: "p0" }, { id: "p1" }]);
    expect(resultat.map((r) => r.id)).to.deep.equal(["a", "p0", "p1", "b"]);
  });

  it("repère une cote différente du format, sans fausse alerte", () => {
    expect(coteDifferente({ refClient: "Panneau expo 60.5 x 200 cm - OFFERT", formatVisu: "100x210" })).to.equal(true);
    expect(coteDifferente({ refClient: "ONYX 100 x 210", formatVisu: "100x210" })).to.equal(false);
    expect(coteDifferente({ refClient: "", formatVisu: "100x210" })).to.equal(false);
  });

  it("calcule le statut et la confirmation", () => {
    expect(statutPanneau([{ bloquant: true }, ECART])).to.equal("Bloqué");
    expect(ecartsAConfirmer({ ecarts: [ECART], ecartsConfirmes: false })).to.equal(true);
    expect(ecartsAConfirmer({ ecarts: [ECART], ecartsConfirmes: true })).to.equal(false);
    expect(ecartsAConfirmer(null)).to.equal(false);
    expect(estSurMesureVisuel({ surMesure: true, surMesureKind: "visuel" })).to.equal(true);
    expect(estSurMesureVisuel({ surMesure: true, surMesureKind: "teinte_masse" })).to.equal(false);
  });
});
