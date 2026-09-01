const { expect } = require("chai");
const sinon = require("sinon");

const RefDeco = require("../../server/src/models/RefDeco");
const RefEcom = require("../../server/src/models/RefEcom");
const RefBrico = require("../../server/src/models/RefBrico");
const RefCasto = require("../../server/src/models/RefCasto");
const { findStockReferences } = require("../../server/src/gamesys/services/dossierService");

// Fait matcher enrichRowsWithMongoRef sur la 1re passe (st_art_ref_client trouvé dans le
// catalogue interne) -> la ligne stock est renvoyée telle quelle, sans lookup model+format.
function stubRefsMatchOnRefClient() {
  for (const Model of [RefDeco, RefEcom, RefBrico, RefCasto]) {
    sinon.stub(Model, "findOne").callsFake((q) => ({
      lean: async () => (q && q.ref ? { ref: q.ref, model: "MODELE", finition: "", format: "100x210" } : null),
    }));
  }
}

describe("dossierService.findStockReferences() — priorité 0 (endv_orderline_seq_article)", () => {
  afterEach(() => sinon.restore());

  it("résout via st_seq_compt quand endv_orderline_seq_article > 0 et court-circuite la cascade", async () => {
    stubRefsMatchOnRefClient();
    const stockRow = {
      st_seq: 1,
      st_seq_compt: 4972,
      st_modele: "94953523",
      st_art_ref_client: "94953523",
      st_lib_1_conso: "PALMERAIE DROITE 100x255cm (M)",
      st_lib_2_conso: "",
      st_art_gencod: "3664719637338",
      st_code_tarif: "",
      st_art_famille: "DECO LM",
      st_art_sfamille: "Les pays",
      st_type: "",
    };
    const connection = { query: sinon.stub().resolves([stockRow]) };

    const entete = { endv_identif: "PALMERAIE DROITE 100x255cm", endv_orderline_seq_article: 4972 };
    const result = await findStockReferences(connection, [entete], null, null);

    expect(connection.query.callCount).to.equal(1);
    const [sql, params] = connection.query.firstCall.args;
    expect(sql).to.match(/st_seq_compt = \?/);
    expect(params).to.deep.equal([4972]);
    expect(result).to.have.length(1);
    expect(result[0].reference).to.equal("94953523");
    expect(result[0].source).to.equal("fs_stock_orderline");
  });

  it("marque le sur-mesure via st_art_sfamille='SMES' résolu par la jointure", async () => {
    stubRefsMatchOnRefClient();
    const stockRow = {
      st_seq: 2,
      st_seq_compt: 8130,
      st_modele: "LM-SM100X210L",
      st_art_ref_client: "LM-SM100X210L",
      st_lib_1_conso: "Panneau déco sur-mesure 100x210 Finition Lisse",
      st_lib_2_conso: "",
      st_art_gencod: "",
      st_code_tarif: "",
      st_art_famille: "DECO LM",
      st_art_sfamille: "SMES",
      st_type: "",
    };
    const connection = { query: sinon.stub().resolves([stockRow]) };

    const entete = {
      endv_identif: "Panneau déco sur-mesure 100x210 Finition Lisse",
      endv_orderline_seq_article: 8130,
    };
    const result = await findStockReferences(connection, [entete], null, null);

    expect(result).to.have.length(1);
    expect(result[0].sousFamille).to.equal("SMES");
    expect(result[0].source).to.equal("fs_stock_orderline");
  });

  it("retombe sur la cascade quand st_seq_compt ne résout rien (query renvoie [])", async () => {
    for (const Model of [RefDeco, RefEcom, RefBrico, RefCasto]) {
      sinon.stub(Model, "findOne").callsFake(() => ({ lean: async () => null }));
      sinon.stub(Model, "find").callsFake(() => ({ lean: async () => [] }));
    }
    // Toutes les requêtes stock renvoient [] : la priorité 0 échoue puis la cascade aussi.
    const connection = { query: sinon.stub().resolves([]) };

    const entete = {
      endv_identif: "ONYX GAUCHE 125x255cm",
      endv_ref_client: "ONYXG-125255",
      endv_orderline_seq_article: 999999,
    };
    const result = await findStockReferences(connection, [entete], null, null);

    // 1re requête = tentative priorité 0 sur st_seq_compt ...
    expect(connection.query.firstCall.args[0]).to.match(/st_seq_compt = \?/);
    // ... puis au moins une requête supplémentaire (cascade) a été tentée.
    expect(connection.query.callCount).to.be.greaterThan(1);
    expect(result).to.deep.equal([]);
  });

  it("saute la priorité 0 quand endv_orderline_seq_article est absent / 0", async () => {
    const connection = { query: sinon.stub().resolves([]) };

    const entete = { endv_identif: "Kit de pose pour 1 panneau", endv_orderline_seq_article: 0 };
    await findStockReferences(connection, [entete], null, null);

    // La branche kit de pose part directement sur st_code_tarif='KITPOSE', pas sur st_seq_compt.
    const firstSql = connection.query.firstCall.args[0];
    expect(firstSql).to.match(/KITPOSE/);
    expect(firstSql).to.not.match(/st_seq_compt = \?/);
  });
});
