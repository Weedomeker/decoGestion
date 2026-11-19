const { expect } = require("chai");
const sinon = require("sinon");
const express = require("express");
const logger = require("../../server/src/logger/logger");
const modelDeco = require("../../server/src/models/Deco");
const { exportHistory } = require("../../server/src/controllers/jobsController");
const { ENTETE_CSV, ligneCsv } = require("../../server/src/utils/historyCsv");

// modelDeco.find(...).sort(...).lean().cursor() → documents fournis un par un, ou erreur au milieu.
function stubCurseur(docs, { erreurApres = null } = {}) {
  const close = sinon.stub().resolves();
  const cursor = {
    close,
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < docs.length; i++) {
        if (erreurApres === i) throw new Error("Mongo coupé");
        yield docs[i];
      }
    },
  };
  const find = sinon.stub(modelDeco, "find").returns({
    sort: () => ({ lean: () => ({ cursor: () => cursor }) }),
  });
  return { find, close };
}

describe("exportHistory — export CSV en flux", () => {
  let server;
  let base;

  before((done) => {
    const app = express();
    app.get("/history/export", exportHistory);
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      done();
    });
  });

  after(() => server.close());
  beforeEach(() => sinon.stub(logger, "error")); // erreurs attendues : pas de bruit dans la sortie
  afterEach(() => sinon.restore());

  it("écrit l'en-tête puis une ligne par document, et ne lit que les colonnes du CSV", async () => {
    const docs = [
      { date: new Date(2026, 10, 19, 8, 5), client: "LM", numCmd: 169580, mag: "AMIENS", deco: 'BOIS "CLAIR"', ex: 2 },
      { client: "CASTO", deco: "MOSAIQUE", prodBlanc: true },
    ];
    const { find, close } = stubCurseur(docs);

    const res = await fetch(`${base}/history/export?client=LM`);
    const corps = await res.text();

    expect(res.status).to.equal(200);
    expect(res.headers.get("content-disposition")).to.match(/^attachment; filename="historique-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(corps).to.equal(ENTETE_CSV + ligneCsv(docs[0]) + ligneCsv(docs[1]));
    expect(ligneCsv(docs[0])).to.equal('"2026-11-19 08:05","LM",169580,"AMIENS","BOIS ""CLAIR""","","","",2,0,0,0,0\n');
    expect(find.firstCall.args[1]).to.include("deco").and.not.include("statusDates");
    expect(close.calledOnce).to.equal(true);
  });

  it("répond 500 en JSON si l'erreur survient avant le début du CSV", async () => {
    sinon.stub(modelDeco, "find").throws(new Error("Mongo indisponible"));

    const res = await fetch(`${base}/history/export`);

    expect(res.status).to.equal(500);
    expect(await res.json()).to.have.property("error");
  });

  it("coupe la connexion si Mongo tombe en plein export, au lieu de livrer un CSV tronqué", async () => {
    stubCurseur([{ client: "LM" }, { client: "BRICO" }], { erreurApres: 1 });

    let erreur = null;
    try {
      const res = await fetch(`${base}/history/export`);
      await res.text();
    } catch (err) {
      erreur = err;
    }

    expect(erreur, "le téléchargement doit échouer côté navigateur").to.not.equal(null);
  });
});
