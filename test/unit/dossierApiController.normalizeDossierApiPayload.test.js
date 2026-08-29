const { expect } = require("chai");
const { normalizeDossierApiPayload } = require("../../server/src/controllers/dossierApiController");

function makeSousDossier({ sousNumero, commande, endvPxTotal, libelle, reference }) {
  return {
    sousNumero,
    commande,
    enteteDevis: [
      {
        endv_identif: libelle,
        endv_quant: 1,
        endv_px_total: endvPxTotal,
      },
    ],
    visualReferences: [
      {
        reference,
        libelle,
        source: "fs_stock",
      },
    ],
    livraison: [],
  };
}

describe("dossierApiController.normalizeDossierApiPayload() — prix", () => {
  it("attache le prix du sous-dossier à chaque visuel et somme le prixTotal du dossier", () => {
    const payload = {
      numero: "167435",
      clientName: "LM",
      sousDossiers: [
        makeSousDossier({ sousNumero: "00", commande: "167435/00", endvPxTotal: 243.69, libelle: "PALMERAIE", reference: "REF1" }),
        makeSousDossier({ sousNumero: "01", commande: "167435/01", endvPxTotal: 205.03, libelle: "LATTES BOIS", reference: "REF2" }),
      ],
    };

    const result = normalizeDossierApiPayload(payload);

    expect(result.prixTotal).to.equal(448.72);
    expect(result.visualJobs).to.have.length(2);
    expect(result.visualJobs[0].prix).to.equal(243.69);
    expect(result.visualJobs[1].prix).to.equal(205.03);
  });

  it("laisse prix/prixTotal undefined si aucune ligne n'a de endv_px_total exploitable", () => {
    const payload = {
      numero: "999999",
      clientName: "LM",
      sousDossiers: [
        makeSousDossier({ sousNumero: "00", commande: "999999/00", endvPxTotal: null, libelle: "SANS PRIX", reference: "REF1" }),
      ],
    };

    const result = normalizeDossierApiPayload(payload);

    expect(result.prixTotal).to.be.undefined;
    expect(result.visualJobs[0].prix).to.be.undefined;
  });

  it("préserve un prix de 0 (ne le traite pas comme absent)", () => {
    const payload = {
      numero: "111111",
      clientName: "LM",
      sousDossiers: [
        makeSousDossier({ sousNumero: "00", commande: "111111/00", endvPxTotal: 0, libelle: "GRATUIT", reference: "REF1" }),
      ],
    };

    const result = normalizeDossierApiPayload(payload);

    expect(result.prixTotal).to.equal(0);
    expect(result.visualJobs[0].prix).to.equal(0);
  });

  it("somme plusieurs lignes fd_entete_devi au sein d'un même sous-dossier", () => {
    const payload = {
      numero: "222222",
      clientName: "LM",
      sousDossiers: [
        {
          sousNumero: "00",
          commande: "222222/00",
          enteteDevis: [
            { endv_identif: "A", endv_px_total: 10 },
            { endv_identif: "B", endv_px_total: 5.5 },
          ],
          visualReferences: [{ reference: "REF1", libelle: "A" }],
          livraison: [],
        },
      ],
    };

    const result = normalizeDossierApiPayload(payload);

    expect(result.visualJobs[0].prix).to.equal(15.5);
    expect(result.prixTotal).to.equal(15.5);
  });
});

describe("normalizeDossierApiPayload() — sur-mesure", () => {
  const { normalizeDossierApiPayload } = require("../../server/src/controllers/dossierApiController");

  function payloadWithVisualRef(vr) {
    return {
      numero: "167302",
      clientName: "LM",
      sousDossiers: [
        {
          sousNumero: "05",
          commande: "167302/05",
          enteteDevis: [{ endv_identif: vr.libelle, endv_quant: 1, endv_px_total: 185.08 }],
          livraison: [{ bo_ville: "COLOMIERS" }],
          visualReferences: [vr],
        },
      ],
    };
  }

  it("propage les champs sur-mesure dans visualJobs et prend visualRef.format", () => {
    const out = normalizeDossierApiPayload(
      payloadWithVisualRef({
        reference: "BLANC ZERO 90 x 210 MAT",
        libelle: "Panneau déco sur-mesure 100x210 Finition Lisse",
        surMesure: true,
        surMesureKind: "teinte_masse",
        deco: "BLANC ZERO",
        finition: "LISSE",
        format: "100x210",
        orientation: undefined,
        printFormat: "90x210",
      })
    );
    const job = out.visualJobs[0];
    expect(job.surMesure).to.equal(true);
    expect(job.surMesureKind).to.equal("teinte_masse");
    expect(job.deco).to.equal("BLANC ZERO");
    expect(job.finition).to.equal("LISSE");
    expect(job.printFormat).to.equal("90x210");
    expect(job.orientation).to.equal(null);
    expect(job.formatVisu).to.equal("100x210"); // vient de visualRef.format
  });

  it("émet un warning si sur-mesure sans nom exploitable", () => {
    const out = normalizeDossierApiPayload(
      payloadWithVisualRef({
        reference: "Panneau déco sur-mesure 100x210 Finition Lisse",
        libelle: "Panneau déco sur-mesure 100x210 Finition Lisse",
        surMesure: true,
        surMesureKind: "visuel",
        deco: undefined,
        format: "100x210",
      })
    );
    expect(out.warnings.some((w) => /sur-mesure sans nom/i.test(w))).to.equal(true);
  });

  it("laisse surMesure=false pour un visuel catalogue", () => {
    const out = normalizeDossierApiPayload(
      payloadWithVisualRef({ reference: "TRAVERTI-125255", libelle: "Travertino 125 x 255 cm (M)" })
    );
    expect(out.visualJobs[0].surMesure).to.equal(false);
    expect(out.visualJobs[0].surMesureKind).to.equal(null);
  });
});
