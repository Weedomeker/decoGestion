const { expect } = require("chai");
const sinon = require("sinon");
const { fetchDossierCommandeInfo } = require("../../server/src/gamesys/services/dossierService");

describe("dossierService.fetchDossierCommandeInfo()", () => {
  it("calcule nombreProfil/nombreKitPose/prixTotal et prend dateCommande/codeClient/refClient sur la 1ère ligne", async () => {
    const rows = [
      {
        endv_date_cmde: "2026-08-20",
        endv_cclient: "LM019",
        endv_no_commande_client: "82329874 - FASSOT",
        endv_quant: 2,
        endv_identif: "POSÉIDON GAUCHE 100x255cm",
        endv_px_total: "199.90",
      },
      {
        endv_date_cmde: "2026-08-20",
        endv_cclient: "LM019",
        endv_no_commande_client: "82329874 - FASSOT",
        endv_quant: 1,
        endv_identif: "PROFILE DE FINITION ALU MAT 255cm",
        endv_px_total: "12.50",
      },
      {
        endv_date_cmde: "2026-08-20",
        endv_cclient: "LM019",
        endv_no_commande_client: "82329874 - FASSOT",
        endv_quant: 2,
        endv_identif: "PROFILE ANGLE INTERIEUR ALU MAT 255cm",
        endv_px_total: "8",
      },
      {
        endv_date_cmde: "2026-08-20",
        endv_cclient: "LM019",
        endv_no_commande_client: "82329874 - FASSOT",
        endv_quant: 3,
        endv_identif: "PROFILE DE RACCORD ALU MAT 255cm",
        endv_px_total: "10",
      },
      {
        endv_date_cmde: "2026-08-20",
        endv_cclient: "LM019",
        endv_no_commande_client: "82329874 - FASSOT",
        endv_quant: 5,
        endv_identif: "Kit de pose pour 1 panneau + calle + mode d'emploi ",
        endv_px_total: "19.60",
      },
    ];
    const connection = { query: sinon.stub().resolves(rows) };

    const result = await fetchDossierCommandeInfo(connection, "167648");

    expect(result.dateCommande).to.be.instanceOf(Date);
    expect(result.dateCommande.toISOString().slice(0, 10)).to.equal("2026-08-20");
    expect(result.codeClient).to.equal("LM019");
    expect(result.refClient).to.equal("82329874 - FASSOT");
    expect(result.nombreProfil).to.equal(6);
    expect(result.nombreKitPose).to.equal(5);
    expect(result.prixTotal).to.equal(250);

    const [sql, params] = connection.query.firstCall.args;
    expect(sql).to.match(/fd_entete_devi/);
    expect(sql).to.match(/endv_no_dossier/);
    expect(sql).to.match(/endv_px_total/);
    expect(params).to.deep.equal(["167648", "167648", "167648", "167648/%"]);
  });

  it("préserve une somme prixTotal de 0 (ne la traite pas comme absente)", async () => {
    const connection = {
      query: sinon.stub().resolves([
        {
          endv_date_cmde: "2026-08-20",
          endv_cclient: "LM019",
          endv_no_commande_client: "REF",
          endv_quant: 1,
          endv_identif: "PROFIL",
          endv_px_total: "0",
        },
      ]),
    };

    const result = await fetchDossierCommandeInfo(connection, "167648");

    expect(result.prixTotal).to.equal(0);
  });

  it("renvoie prixTotal=null si aucune ligne n'a de prix exploitable", async () => {
    const connection = {
      query: sinon.stub().resolves([
        {
          endv_date_cmde: "2026-08-20",
          endv_cclient: "LM019",
          endv_no_commande_client: "REF",
          endv_quant: 1,
          endv_identif: "PROFIL",
          endv_px_total: null,
        },
      ]),
    };

    const result = await fetchDossierCommandeInfo(connection, "167648");

    expect(result.prixTotal).to.be.null;
  });

  it("retourne null si aucune ligne ne matche", async () => {
    const connection = { query: sinon.stub().resolves([]) };

    const result = await fetchDossierCommandeInfo(connection, "999999");

    expect(result).to.be.null;
  });

  it("retourne null si commande est vide, sans requêter", async () => {
    const connection = { query: sinon.stub() };

    const result = await fetchDossierCommandeInfo(connection, "");

    expect(result).to.be.null;
    expect(connection.query.called).to.be.false;
  });

  it("ignore les quantités des lignes visuel dans nombreProfil/nombreKitPose", async () => {
    const connection = {
      query: sinon.stub().resolves([
        {
          endv_date_cmde: "2026-08-20",
          endv_cclient: "CAS02",
          endv_no_commande_client: "REF-1",
          endv_quant: 4,
          endv_identif: "VISUEL MOSAIQUE",
        },
      ]),
    };

    const result = await fetchDossierCommandeInfo(connection, "100473");

    expect(result.nombreProfil).to.equal(0);
    expect(result.nombreKitPose).to.equal(0);
  });
});
