"use strict";
const assert = require("node:assert/strict");
const sinon = require("sinon");
const websocketService = require("../../server/src/services/websocketService");
const logger = require("../../server/src/logger/logger");

describe("progressionService", () => {
  let service;
  let envois;
  let horloge;

  beforeEach(() => {
    horloge = sinon.useFakeTimers();
    sinon.stub(websocketService, "broadcastWS").callsFake((m) => envois.push(m));
    sinon.stub(logger, "warn");
    envois = [];
    const chemin = require.resolve("../../server/src/services/progressionService");
    delete require.cache[chemin];
    service = require(chemin);
  });

  afterEach(() => {
    service.finir();
    horloge.restore();
    sinon.restore();
  });

  it("sans lancement : rien à lire, rien n'est diffusé", () => {
    service.debut(1);
    service.etape(1, "pdf");
    service.finir();
    assert.equal(service.lire(), null);
    assert.equal(envois.length, 0);
  });

  it("diffuse à chaque événement, puis toutes les 5 s jusqu'à la fin", () => {
    service.demarrer([{ _id: 1, cmd: 100 }]);
    service.debut(1);
    service.etape(1, "pdf");
    assert.equal(envois.length, 3);
    assert.ok(envois.every((m) => m.type === "progression"));
    horloge.tick(10_000);
    assert.equal(envois.length, 5);
    service.finir();
    const apres = envois.length;
    horloge.tick(30_000);
    assert.equal(envois.length, apres);
    assert.equal(envois.at(-1).progression.phase, "fini");
  });

  it("le dernier lancement reste lisible, le suivant repart de zéro", () => {
    service.demarrer([{ _id: 1 }]);
    service.debut(1);
    service.echec(1, "Visuel introuvable");
    service.finir();
    assert.equal(service.lire().jobs[0].raison, "Visuel introuvable");
    service.demarrer([{ _id: 2 }]);
    assert.equal(service.lire().pct, 0);
    assert.deepEqual(
      service.lire().jobs.map((j) => j.id),
      ["2"],
    );
  });

  it("une erreur de diffusion n'atteint jamais le job", () => {
    service.demarrer([{ _id: 1 }]);
    websocketService.broadcastWS.restore();
    const boum = [null]; // jobs invalides : creerSuivi lève
    assert.doesNotThrow(() => service.demarrer(boum));
    sinon.assert.calledOnce(logger.warn);
  });
});
