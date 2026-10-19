const { expect } = require("chai");
const sinon = require("sinon");
const logger = require("../../server/src/logger/logger");
const { addJob } = require("../../server/src/controllers/jobsController");

// Les refus de add_job doivent laisser une trace dans le log serveur (cas 169005 : BLANC ZERO 125x255
// envoyé sans format plaque, refusé en 400 sans que rien n'apparaisse dans les logs de prod).
describe("jobsController.addJob() — journalisation des refus", () => {
  let warnStub;
  let res;

  beforeEach(() => {
    warnStub = sinon.stub(logger, "warn");
    res = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      },
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  it("journalise un refus 400 pour formatTauro manquant, avec le contexte du job", async () => {
    await addJob(
      {
        body: {
          client: "LM",
          visuel: "BLANC ZERO MAT",
          format: "./server/public/LM/5_125x255",
          formatTauro: "",
          numCmd: "169005",
          ex: 1,
          teinteMasse: true,
        },
      },
      res,
    );

    expect(res.statusCode).to.equal(400);
    expect(res.body.error).to.match(/formatTauro/);
    expect(warnStub.calledOnce).to.be.true;
    const message = warnStub.firstCall.args[0];
    expect(message).to.include("add_job refusé (400)");
    expect(message).to.include("cmd=169005");
    expect(message).to.include("visuel=BLANC ZERO MAT");
  });

  it("journalise un refus 400 pour un nombre d'exemplaires invalide", async () => {
    await addJob(
      { body: { client: "LM", visuel: "BLANC ZERO MAT", format: "125x255", formatTauro: "Deco_Std_126x260", ex: 0 } },
      res,
    );

    expect(res.statusCode).to.equal(400);
    expect(warnStub.calledOnce).to.be.true;
    expect(warnStub.firstCall.args[0]).to.include("exemplaires");
  });
});
