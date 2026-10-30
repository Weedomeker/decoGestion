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

  // 255x60 + 300x60 envoyés en 126x260 : le 300x60 sortait rogné à 260 cm sans erreur.
  it("refuse une crédence amalgamée plus longue que la plaque", async () => {
    await addJob(
      {
        body: {
          client: "CASTO",
          numCmd: "999803",
          numCmd2: "999803",
          ex: 1,
          visuel: "server/public/CASTO/1_255x60/CRED 255x60cm MOSAIQUE CARRELEE 3664714617953 MAT.pdf",
          format: "server/public/CASTO/1_255x60/",
          visuel2: "server/public/CASTO/2_300x60/CRED 300x60cm MARBRE BLANC 3664714023259 MAT.pdf",
          format2: "server/public/CASTO/2_300x60/",
          formatTauro: "Deco_Std_126x260",
        },
      },
      res,
    );

    expect(res.statusCode).to.equal(400);
    expect(res.body.error).to.include("126x260");
    expect(res.body.error).to.include("120x300");
  });
});
