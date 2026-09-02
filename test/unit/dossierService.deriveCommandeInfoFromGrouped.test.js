const { expect } = require("chai");
const { deriveCommandeInfoFromGrouped } = require("../../server/src/gamesys/services/dossierService");

function sousDossier(overrides = {}) {
  return {
    enteteDevis: [],
    livraisons: [],
    dossier: {},
    ...overrides,
  };
}

describe("dossierService.deriveCommandeInfoFromGrouped()", () => {
  it("agrège dateCommande/codeClient/refClient depuis la 1ère ligne d'entête", () => {
    const grouped = {
      sousDossiers: [
        sousDossier({
          enteteDevis: [
            { endv_date_cmde: "2026-08-19", endv_cclient: "LM123", endv_no_commande_client: "REF-1", endv_identif: "VISUEL", endv_quant: 1 },
          ],
        }),
      ],
    };

    const info = deriveCommandeInfoFromGrouped(grouped, "LM");

    expect(info.dateCommande.toISOString().slice(0, 10)).to.equal("2026-08-19");
    expect(info.codeClient).to.equal("LM123");
    expect(info.refClient).to.equal("REF-1");
  });

  it("compte nombreProfil/nombreKitPose via isProfileLabel/isKitPoseLabel", () => {
    const grouped = {
      sousDossiers: [
        sousDossier({
          enteteDevis: [
            { endv_identif: "PROFIL ALU", endv_quant: 2 },
            { endv_identif: "KIT DE POSE", endv_quant: 1 },
            { endv_identif: "VISUEL DECOR", endv_quant: 1 },
          ],
        }),
      ],
    };

    const info = deriveCommandeInfoFromGrouped(grouped, "LM");

    expect(info.nombreProfil).to.equal(2);
    expect(info.nombreKitPose).to.equal(1);
  });

  it("somme endv_px_total sur toutes les lignes/sous-dossiers (prixTotal commande entière)", () => {
    const grouped = {
      sousDossiers: [
        sousDossier({ enteteDevis: [{ endv_px_total: 100 }, { endv_px_total: 50 }] }),
        sousDossier({ enteteDevis: [{ endv_px_total: 25.5 }] }),
      ],
    };

    const info = deriveCommandeInfoFromGrouped(grouped, "LM");

    expect(info.prixTotal).to.equal(175.5);
  });

  it("prixTotal reste null quand aucune ligne n'a de prix", () => {
    const grouped = { sousDossiers: [sousDossier({ enteteDevis: [{ endv_identif: "VISUEL" }] })] };

    const info = deriveCommandeInfoFromGrouped(grouped, "LM");

    expect(info.prixTotal).to.be.null;
  });

  it("mag = ville de livraison pour LM/CASTO/BRICO (repli sur bo_adlivr_nom_1)", () => {
    const grouped = {
      sousDossiers: [sousDossier({ livraisons: [{ bo_ville: "CHOLET", bo_adlivr_nom_1: "LEROY MERLIN CHOLET" }] })],
    };

    expect(deriveCommandeInfoFromGrouped(grouped, "LM").mag).to.equal("CHOLET");
  });

  it("mag = nom destinataire pour ECOM (pas de notion de magasin)", () => {
    const grouped = {
      sousDossiers: [sousDossier({ livraisons: [{ bo_ville: "PARIS", bo_adlivr_nom_1: "M. DUPONT" }] })],
    };

    expect(deriveCommandeInfoFromGrouped(grouped, "ECOM").mag).to.equal("M. DUPONT");
  });

  it("dateDepartUsine/dateLivraisonSouhaitee dérivées de ff_livraison", () => {
    const grouped = {
      sousDossiers: [
        sousDossier({ livraisons: [{ bo_date_depart_usine: "2026-09-01", bo_date_souhaitee: "2026-09-05" }] }),
      ],
    };

    const info = deriveCommandeInfoFromGrouped(grouped, "LM");

    expect(info.dateDepartUsine.toISOString().slice(0, 10)).to.equal("2026-09-01");
    expect(info.dateLivraisonSouhaitee.toISOString().slice(0, 10)).to.equal("2026-09-05");
  });

  it("formatPlaqueGamesys pris sur le 1er sous-dossier dont dos_supp_1_ft est renseigné", () => {
    const grouped = {
      sousDossiers: [
        sousDossier({ dossier: { dos_supp_1_ft: "  " } }),
        sousDossier({ dossier: { dos_supp_1_ft: "1510 x 2600" } }),
      ],
    };

    expect(deriveCommandeInfoFromGrouped(grouped, "LM").formatPlaqueGamesys).to.equal("1510 x 2600");
  });

  it("dateCommande replie sur dos_date si aucune ligne d'entête n'a endv_date_cmde", () => {
    const grouped = {
      sousDossiers: [sousDossier({ enteteDevis: [{}], dossier: { dos_date: "2026-08-15" } })],
    };

    expect(deriveCommandeInfoFromGrouped(grouped, "LM").dateCommande.toISOString().slice(0, 10)).to.equal("2026-08-15");
  });

  it("gère un grouped sans sousDossiers sans planter", () => {
    const info = deriveCommandeInfoFromGrouped({}, "LM");

    expect(info.nombreProfil).to.equal(0);
    expect(info.nombreKitPose).to.equal(0);
    expect(info.prixTotal).to.be.null;
    expect(info.dateCommande).to.be.null;
    expect(info.mag).to.be.undefined;
  });
});
