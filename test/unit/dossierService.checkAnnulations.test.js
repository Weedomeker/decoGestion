const { expect } = require("chai");
const sinon = require("sinon");

const { checkAnnulations } = require("../../server/src/gamesys/services/dossierService");

describe("dossierService.checkAnnulations()", () => {
  afterEach(() => sinon.restore());

  it("ne fait aucune requête et renvoie [] quand la liste de numéros est vide", async () => {
    const connection = { query: sinon.stub() };

    const result = await checkAnnulations(connection, []);

    expect(result).to.deep.equal([]);
    expect(connection.query.called).to.be.false;
  });

  it("interroge fd_entete_devi avec la liste des numéros de commande demandés", async () => {
    const connection = { query: sinon.stub().resolves([]) };

    await checkAnnulations(connection, ["168251/00", "168251/01"]);

    expect(connection.query.calledOnce).to.be.true;
    const [sql] = connection.query.firstCall.args;
    expect(sql).to.match(/from public\.fd_entete_devi/);
    expect(sql).to.match(/endv_no_commande in \('168251\/00', '168251\/01'\)/);
  });

  it("retient un numéro dont la date d'annulation est postérieure à la date de commande", async () => {
    const connection = {
      query: sinon.stub().resolves([
        { endv_no_commande: "168217/00", endv_date_cmde: "2026-09-17", endv_date_annul: "2026-09-21" },
      ]),
    };

    const result = await checkAnnulations(connection, ["168217/00"]);

    expect(result).to.deep.equal(["168217/00"]);
  });

  it("ignore un numéro non annulé (date d'annulation = sentinelle 1900-01-01)", async () => {
    const connection = {
      query: sinon.stub().resolves([
        { endv_no_commande: "100470/00", endv_date_cmde: "2024-10-18", endv_date_annul: "1900-01-01" },
      ]),
    };

    const result = await checkAnnulations(connection, ["100470/00"]);

    expect(result).to.deep.equal([]);
  });

  it("ignore un numéro dont la date d'annulation est antérieure à la date de commande (donnée incohérente)", async () => {
    const connection = {
      query: sinon.stub().resolves([
        { endv_no_commande: "168291/00", endv_date_cmde: "2026-09-21", endv_date_annul: "2025-09-05" },
      ]),
    };

    const result = await checkAnnulations(connection, ["168291/00"]);

    expect(result).to.deep.equal([]);
  });
});

describe("dossierService.checkAnnulationsParCommande()", () => {
  const { checkAnnulationsParCommande } = require("../../server/src/gamesys/services/dossierService");

  it("ne fait aucune requête et renvoie [] quand la liste de commandes est vide", async () => {
    const connection = { query: sinon.stub() };

    const result = await checkAnnulationsParCommande(connection, []);

    expect(result).to.deep.equal([]);
    expect(connection.query.called).to.be.false;
  });

  it("interroge fd_entete_devi sur tous les sous-dossiers des commandes demandées", async () => {
    const connection = { query: sinon.stub().resolves([]) };

    await checkAnnulationsParCommande(connection, [168051, 168052]);

    expect(connection.query.calledOnce).to.be.true;
    const [sql] = connection.query.firstCall.args;
    expect(sql).to.match(/from public\.fd_entete_devi/);
    expect(sql).to.match(/endv_no_commande like '168051\/%'/);
    expect(sql).to.match(/endv_no_commande like '168052\/%'/);
  });

  it("retient une commande dont TOUS les sous-dossiers sont annulés", async () => {
    const connection = {
      query: sinon.stub().resolves([
        { endv_no_commande: "168051/01", endv_date_cmde: "2026-09-17", endv_date_annul: "2026-09-21" },
        { endv_no_commande: "168051/02", endv_date_cmde: "2026-09-17", endv_date_annul: "2026-09-22" },
      ]),
    };

    const result = await checkAnnulationsParCommande(connection, [168051]);

    expect(result).to.deep.equal([168051]);
  });

  it("ignore une commande partiellement annulée", async () => {
    const connection = {
      query: sinon.stub().resolves([
        { endv_no_commande: "168051/01", endv_date_cmde: "2026-09-17", endv_date_annul: "2026-09-21" },
        { endv_no_commande: "168051/02", endv_date_cmde: "2026-09-17", endv_date_annul: "1900-01-01" },
      ]),
    };

    const result = await checkAnnulationsParCommande(connection, [168051]);

    expect(result).to.deep.equal([]);
  });

  it("ignore une commande absente de Gamesys", async () => {
    const connection = { query: sinon.stub().resolves([]) };

    const result = await checkAnnulationsParCommande(connection, [168051]);

    expect(result).to.deep.equal([]);
  });
});
