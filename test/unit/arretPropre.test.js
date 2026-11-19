const { expect } = require("chai");
const sinon = require("sinon");
const { creerArretPropre } = require("../../server/src/services/arretPropre");

describe("creerArretPropre", () => {
  let logger;
  let exit;

  beforeEach(() => {
    logger = { info: sinon.spy(), warn: sinon.spy(), error: sinon.spy() };
    exit = sinon.spy();
  });

  afterEach(() => sinon.restore());

  it("ferme les étapes dans l'ordre, chacune attendue, puis sort en 0", async () => {
    const ordre = [];
    const etape = (nom, ms) => ({
      nom,
      fermer: () => new Promise((r) => setTimeout(() => { ordre.push(nom); r(); }, ms)),
    });
    const arreter = creerArretPropre({
      logger,
      exit,
      etapes: [etape("http", 0), etape("file", 20), etape("mongo", 0)],
    });

    await arreter("SIGINT");

    expect(ordre).to.deep.equal(["http", "file", "mongo"]);
    expect(exit.calledOnceWithExactly(0)).to.equal(true);
  });

  it("continue après une étape en échec et la journalise", async () => {
    const mongo = sinon.spy();
    const arreter = creerArretPropre({
      logger,
      exit,
      etapes: [
        { nom: "file", fermer: () => Promise.reject(new Error("Redis injoignable")) },
        { nom: "mongo", fermer: mongo },
      ],
    });

    await arreter("SIGTERM");

    expect(mongo.calledOnce).to.equal(true);
    expect(logger.error.firstCall.args[0]).to.include("file").and.include("Redis injoignable");
    expect(exit.calledOnceWithExactly(0)).to.equal(true);
  });

  it("un second Ctrl+C force la sortie sans attendre les jobs", async () => {
    let finirJobs;
    const arreter = creerArretPropre({
      logger,
      exit,
      etapes: [{ nom: "file", fermer: () => new Promise((r) => (finirJobs = r)) }],
    });

    const premier = arreter("SIGINT");
    await arreter("SIGINT");
    expect(exit.calledOnceWithExactly(1)).to.equal(true);

    finirJobs();
    await premier;
  });

  it("force la sortie si l'arrêt dépasse le délai", async () => {
    const clock = sinon.useFakeTimers();
    const arreter = creerArretPropre({
      logger,
      exit,
      delaiMs: 1000,
      etapes: [{ nom: "file", fermer: () => new Promise(() => {}) }],
    });

    arreter("SIGINT");
    await clock.tickAsync(1000);

    expect(exit.calledOnceWithExactly(1)).to.equal(true);
    expect(logger.error.firstCall.args[0]).to.include("trop long");
  });
});
