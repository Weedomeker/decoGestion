"use strict";
const assert = require("node:assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");

describe("progression (client)", () => {
  let client;
  const enCours = (extra = {}) => ({
    phase: "jobs",
    total: 40,
    faits: 12,
    echecs: 0,
    annules: 0,
    enCours: 3,
    nouvelles: 0,
    pct: 37.4,
    vitesse: 0.2,
    plafond: 41,
    resteMs: 14 * 60000,
    fin: null,
    dureeMs: null,
    avertissement: null,
    ...extra,
  });
  const textes = (etat) => etat.gauche.map((m) => m.texte);

  before(async () => {
    client = await import(pathToFileURL(path.join(__dirname, "../../client/src/utils/progression.js")).href);
  });

  it("prolonge à la vitesse annoncée, sans dépasser le plafond ni reculer", () => {
    assert.equal(client.projeter(10, 2, 30, 5000), 20);
    assert.equal(client.projeter(10, 2, 30, 60000), 30);
    assert.equal(client.projeter(10, 2, 30, -5000), 10);
    assert.equal(client.projeter(31, 2, 30, 1000), 31);
  });

  it("100 % seulement quand le serveur annonce la fin", () => {
    assert.equal(client.pourcentageAffiche(enCours(), 0), 37);
    assert.equal(client.pourcentageAffiche(enCours({ pct: 99.9, plafond: 100 }), 60000), 99);
    assert.equal(client.pourcentageAffiche(enCours({ phase: "fini" }), 0), 100);
  });

  it("temps restant arrondi, jamais plus précis que l'estimation", () => {
    assert.equal(client.formatReste(3000), "~10 s");
    assert.equal(client.formatReste(42000), "~50 s");
    assert.equal(client.formatReste(13.2 * 60000), "~14 min");
    assert.equal(client.formatReste(null), "");
  });

  it("en cours : jobs, échecs et nouvelles tentatives", () => {
    const etat = client.etatBandeau(enCours({ echecs: 1, nouvelles: 2 }));
    assert.deepEqual(textes(etat), ["3 en cours", "1 échec", "2 nouvelles tentatives"]);
    assert.equal(etat.ton, "echec");
    assert.equal(etat.actif, true);
    assert.match(etat.droite, /^reste ~14 min, fin vers \d\d:\d\d$/);
  });

  it("le temps restant décompte entre deux messages", () => {
    const etat = client.etatBandeau(enCours(), { ecouleMs: 5 * 60000 });
    assert.match(etat.droite, /^reste ~9 min/);
  });

  it("tant que rien n'est mesuré, pas de temps restant inventé", () => {
    assert.equal(client.etatBandeau(enCours({ resteMs: null })).droite, "estimation du temps restant…");
  });

  it("pause et annulation", () => {
    const pause = client.etatBandeau(enCours(), { paused: true });
    assert.deepEqual(textes(pause), ["En pause", "3 jobs se terminent"]);
    assert.equal(pause.ton, "pause");
    assert.equal(pause.droite, "temps restant suspendu");
    const annulation = client.etatBandeau(enCours({ annules: 4, enCours: 1 }));
    assert.deepEqual(textes(annulation), ["Annulation : 1 job se termine, 4 restent en attente"]);
  });

  it("étiquettes, puis bilan du dernier lancement", () => {
    assert.deepEqual(textes(client.etatBandeau(enCours({ phase: "etiquettes", resteMs: 8000 }))), [
      "Génération des étiquettes",
    ]);
    const fini = client.etatBandeau(
      enCours({ phase: "fini", faits: 38, echecs: 2, fin: Date.UTC(2026, 10, 24, 9, 42), dureeMs: 35 * 60000 }),
    );
    assert.deepEqual(textes(fini), ["Dernier lancement : 38 traités", "2 échecs"]);
    assert.equal(fini.ton, "echec");
    assert.equal(fini.droite, "terminé à 10:42 en 35 min");
    assert.equal(fini.actif, false);
  });

  it("avertissement d'étiquettes signalé dans le bilan", () => {
    const etat = client.etatBandeau(
      enCours({ phase: "fini", fin: 0, dureeMs: 1000, avertissement: "Étiquettes non générées" }),
    );
    assert.ok(textes(etat).includes("Étiquettes non générées"));
    assert.equal(etat.ton, "echec");
  });

  it("tant que le serveur n’a pas répondu, aucun bilan n’est affirmé", () => {
    assert.deepEqual(textes(client.etatBandeau(undefined)), ["Lecture de la file…"]);
  });

  it("au repos : jamais lancé, ou file restée en pause", () => {
    assert.deepEqual(textes(client.etatBandeau(null)), ["Aucun lancement depuis le démarrage"]);
    assert.deepEqual(textes(client.etatBandeau(null, { paused: true })), ["File en pause"]);
  });
});
