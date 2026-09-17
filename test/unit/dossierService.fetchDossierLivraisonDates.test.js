const { expect } = require("chai");
const sinon = require("sinon");
const { fetchDossierLivraisonDates } = require("../../server/src/gamesys/services/dossierService");

describe("dossierService.fetchDossierLivraisonDates()", () => {
  it("retourne les dates de livraison trouvées pour la commande racine", async () => {
    const connection = {
      query: sinon.stub().resolves([{ bo_date_depart_usine: "2025-02-20", bo_date_souhaitee: "2025-03-01" }]),
    };

    const result = await fetchDossierLivraisonDates(connection, "100473");

    expect(result.dateDepartUsine).to.be.instanceOf(Date);
    expect(result.dateDepartUsine.toISOString().slice(0, 10)).to.equal("2025-02-20");
    expect(result.dateLivraisonSouhaitee).to.be.instanceOf(Date);
    expect(result.dateLivraisonSouhaitee.toISOString().slice(0, 10)).to.equal("2025-03-01");
    const [sql, params] = connection.query.firstCall.args;
    expect(sql).to.match(/ff_livraison/);
    expect(sql).to.match(/dos_no_cmde/);
    expect(params).to.deep.equal(["100473", "100473/%"]);
  });

  it("retourne null/null si aucune commande ne matche", async () => {
    const connection = { query: sinon.stub().resolves([{ bo_date_depart_usine: null, bo_date_souhaitee: null }]) };

    const result = await fetchDossierLivraisonDates(connection, "999999");

    expect(result.dateDepartUsine).to.be.null;
    expect(result.dateLivraisonSouhaitee).to.be.null;
  });

  it("retourne null/null si commande est vide, sans requêter", async () => {
    const connection = { query: sinon.stub() };

    const result = await fetchDossierLivraisonDates(connection, "");

    expect(result.dateDepartUsine).to.be.null;
    expect(result.dateLivraisonSouhaitee).to.be.null;
    expect(connection.query.called).to.be.false;
  });

  it("accepte un numCmd numérique", async () => {
    const connection = {
      query: sinon.stub().resolves([{ bo_date_depart_usine: "2025-02-19", bo_date_souhaitee: null }]),
    };

    const result = await fetchDossierLivraisonDates(connection, 100504);

    expect(result.dateDepartUsine.toISOString().slice(0, 10)).to.equal("2025-02-19");
    expect(result.dateLivraisonSouhaitee).to.be.null;
    const [, params] = connection.query.firstCall.args;
    expect(params).to.deep.equal(["100504", "100504/%"]);
  });

  it("expose le repli fc_references (magasinRef / villeRef) et joint sur dos_client", async () => {
    const connection = {
      query: sinon.stub().resolves([
        {
          bo_date_depart_usine: null,
          bo_date_souhaitee: null,
          bo_adlivr_nom_1: null,
          bo_ville: null,
          fo_nom_1: "SA LEROY MERLIN FRANCE (LM CHOLET)",
          fo_ville: "CHOLET",
        },
      ]),
    };

    const result = await fetchDossierLivraisonDates(connection, "167854");

    expect(result.magasin).to.be.null;
    expect(result.ville).to.be.null;
    expect(result.magasinRef).to.equal("SA LEROY MERLIN FRANCE (LM CHOLET)");
    expect(result.villeRef).to.equal("CHOLET");
    const [sql] = connection.query.firstCall.args;
    expect(sql).to.match(/left join public\.fc_references cr on cr\.fo_reference = d\.dos_client/);
    expect(sql).to.match(/left join public\.ff_livraison/);
  });

  it("garde bo_ville / bo_adlivr_nom_1 quand ff_livraison est renseigné", async () => {
    const connection = {
      query: sinon.stub().resolves([
        {
          bo_date_souhaitee: "2026-03-01",
          bo_adlivr_nom_1: "LEROY MERLIN CHOLET",
          bo_ville: "CHOLET",
          fo_nom_1: "SA LEROY MERLIN FRANCE (LM CHOLET)",
          fo_ville: "CHOLET",
        },
      ]),
    };

    const result = await fetchDossierLivraisonDates(connection, "167854");

    expect(result.magasin).to.equal("LEROY MERLIN CHOLET");
    expect(result.ville).to.equal("CHOLET");
    expect(result.magasinRef).to.equal("SA LEROY MERLIN FRANCE (LM CHOLET)");
  });

  it("retourne des champs null quand commande est vide (magasinRef / villeRef compris)", async () => {
    const connection = { query: sinon.stub() };

    const result = await fetchDossierLivraisonDates(connection, "");

    expect(result.magasinRef).to.be.null;
    expect(result.villeRef).to.be.null;
    expect(connection.query.called).to.be.false;
  });
});
