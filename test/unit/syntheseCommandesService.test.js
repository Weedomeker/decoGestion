const { expect } = require("chai");
const sinon = require("sinon");

const dossierService = require("../../server/src/gamesys/services/dossierService");
const dbConfig = require("../../server/src/gamesys/config/db");
const { chargerSyntheseCommandes } = require("../../server/src/services/syntheseCommandesService");

describe("syntheseCommandesService.chargerSyntheseCommandes()", () => {
  let fetchStub;
  let fakeConnection;

  beforeEach(() => {
    fakeConnection = { close: sinon.stub().resolves() };
    fetchStub = sinon.stub(dossierService, "fetchSyntheseCommandes");
    sinon.stub(dbConfig, "getDbConnection").resolves(fakeConnection);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("indexe la synthèse par numCmd numérique", async () => {
    fetchStub.resolves([
      { numCmd: 167435, client: "LM", magasin: "LM CHOLET", prixTotal: 120.5 },
    ]);

    const map = await chargerSyntheseCommandes({ sinceDate: new Date() });

    expect(map).to.be.instanceOf(Map);
    expect(map.get(167435)).to.include({ client: "LM", magasin: "LM CHOLET", prixTotal: 120.5 });
  });

  it("ignore les lignes sans numCmd exploitable ou sans client applicatif", async () => {
    fetchStub.resolves([
      { numCmd: NaN, client: "LM" },
      { numCmd: null, client: "LM" },
      { numCmd: 10, client: null },
      { numCmd: 20, client: "CASTO" },
    ]);

    const map = await chargerSyntheseCommandes({ sinceDate: new Date() });

    expect([...map.keys()]).to.deep.equal([20]);
  });

  it("déduplique un même numCmd en gardant la 1ère ligne (la plus récente via ORDER BY)", async () => {
    fetchStub.resolves([
      { numCmd: 9, client: "LM", magasin: "RECENTE" },
      { numCmd: 9, client: "LM", magasin: "ANCIENNE" },
    ]);

    const map = await chargerSyntheseCommandes({ sinceDate: new Date() });

    expect(map.size).to.equal(1);
    expect(map.get(9).magasin).to.equal("RECENTE");
  });

  it("applique le filtre clients quand il est fourni", async () => {
    fetchStub.resolves([
      { numCmd: 1, client: "LM" },
      { numCmd: 2, client: "ECOM" },
      { numCmd: 3, client: "BRICO" },
    ]);

    const map = await chargerSyntheseCommandes({ sinceDate: new Date(), clients: ["ECOM", "BRICO"] });

    expect([...map.keys()]).to.deep.equal([2, 3]);
  });

  it("propage sinceDate et seulementLivrables à fetchSyntheseCommandes", async () => {
    fetchStub.resolves([]);
    const sinceDate = new Date("2026-08-25T00:00:00.000Z");

    await chargerSyntheseCommandes({ sinceDate, seulementLivrables: true });

    expect(fetchStub.calledOnceWith(fakeConnection, { sinceDate, seulementLivrables: true })).to.be.true;
  });

  it("ouvre puis ferme une connexion dédiée quand aucune n'est injectée", async () => {
    fetchStub.resolves([]);

    await chargerSyntheseCommandes({ sinceDate: new Date() });

    expect(dbConfig.getDbConnection.calledOnce).to.be.true;
    expect(fakeConnection.close.calledOnce).to.be.true;
  });

  it("réutilise la connexion injectée sans l'ouvrir ni la fermer", async () => {
    fetchStub.resolves([]);
    const injectee = { close: sinon.stub().resolves() };

    await chargerSyntheseCommandes({ sinceDate: new Date(), connection: injectee });

    expect(dbConfig.getDbConnection.called).to.be.false;
    expect(injectee.close.called).to.be.false;
  });

  it("ferme la connexion dédiée même si fetchSyntheseCommandes lève", async () => {
    fetchStub.rejects(new Error("ODBC indisponible"));

    let leve = null;
    try {
      await chargerSyntheseCommandes({ sinceDate: new Date() });
    } catch (err) {
      leve = err;
    }

    expect(leve).to.be.instanceOf(Error);
    expect(leve.message).to.equal("ODBC indisponible");
    expect(fakeConnection.close.calledOnce).to.be.true;
  });
});
