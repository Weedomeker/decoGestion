"use strict";
const assert = require("node:assert/strict");
const { dureesAttendues, avanceEtape, creerSuivi } = require("../../server/src/utils/progression");

const MO = 2 ** 20;
const proche = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

describe("progression — durées attendues", () => {
  it("croissent avec le poids du PDF", () => {
    const petit = dureesAttendues({}, 10 * MO);
    const gros = dureesAttendues({}, 400 * MO);
    assert.equal(petit.pdf, 17.5);
    assert.equal(gros.pdf, 310);
    assert.equal(petit.base, gros.base);
    assert.ok(gros.depot > petit.depot);
  });

  it("teinte masse et prise en stock : ni PDF ni dépôt", () => {
    for (const job of [{ teinteMasse: true }, { useStock: true }]) {
      assert.deepEqual(Object.keys(dureesAttendues(job, 300 * MO)), ["jpg", "base"]);
    }
  });
});

describe("progression — avance dans une étape", () => {
  it("suit le temps puis plafonne à 98 %, sans jamais reculer", () => {
    assert.equal(avanceEtape(0, 100), 0);
    assert.equal(avanceEtape(50, 100), 0.5);
    let avant = 0;
    for (let t = 0; t < 2000; t += 10) {
      const a = avanceEtape(t, 100);
      assert.ok(a >= avant && a <= 0.98);
      avant = a;
    }
    proche(avant, 0.98);
  });
});

describe("progression — suivi d'un lancement", () => {
  let t;
  const job = (_id, extra = {}) => ({ _id, cmd: 100 + _id, ...extra });
  const suivi = (jobs, opts = {}) =>
    creerSuivi(jobs, { horloge: () => t, octets: () => 100 * MO, concurrence: () => 1, ...opts });
  // Joue un job jusqu'au bout, chaque étape durant sa durée attendue × `facteur`.
  const jouer = (s, id, facteur = 1) => {
    s.debut(id);
    for (const [etape, duree] of Object.entries(dureesAttendues({}, 100 * MO))) {
      s.etape(id, etape);
      t += duree * 1000 * facteur;
    }
    s.fait(id);
  };

  beforeEach(() => (t = 1_000_000));

  it("part de 0 et ne compte que les jobs du lancement", () => {
    const s = suivi([job(1), job(2)]);
    const etat = s.lire();
    assert.equal(etat.pct, 0);
    assert.equal(etat.total, 2);
    assert.equal(etat.phase, "jobs");
    assert.deepEqual(
      etat.jobs.map((j) => [j.id, j.etat]),
      [
        ["1", "attente"],
        ["2", "attente"],
      ],
    );
  });

  it("pèse chaque job selon son PDF", () => {
    const s = suivi([job(1), job(2)], { octets: (j) => (j._id === 1 ? 10 : 600) * MO });
    s.debut(1);
    s.fait(1);
    const { pct, jobs } = s.lire();
    assert.ok(pct < 12, `le petit PDF compte peu : ${pct}`);
    assert.ok(jobs[1].poids > 8 * jobs[0].poids);
  });

  it("n'atteint 100 % qu'après les étiquettes", () => {
    const s = suivi([job(1)]);
    jouer(s, 1);
    assert.ok(s.lire().pct < 100);
    s.etiquettes();
    assert.equal(s.lire().phase, "etiquettes");
    t += 60_000;
    assert.ok(s.lire().pct < 100);
    s.finir();
    const fin = s.lire();
    assert.equal(fin.pct, 100);
    assert.equal(fin.phase, "fini");
    assert.equal(fin.faits, 1);
    assert.equal(fin.fin, t);
    assert.ok(fin.dureeMs > 0);
  });

  it("ne recule jamais, même sur une nouvelle tentative", () => {
    const s = suivi([job(1), job(2)]);
    s.debut(1);
    s.etape(1, "pdf");
    t += 85_000;
    s.etape(1, "jpg");
    const avant = s.lire().pct;
    s.tentativeEchouee(1, "Job 101 : JPG de sortie manquant ou vide");
    let j = s.lire().jobs[0];
    assert.equal(j.etat, "nouvelle");
    assert.equal(j.raison, "JPG de sortie manquant ou vide");
    s.debut(1);
    s.etape(1, "pdf");
    j = s.lire().jobs[0];
    assert.equal(j.etat, "cours");
    assert.equal(j.tentative, 2);
    assert.ok(s.lire().pct >= avant);
  });

  it("le recalage de vitesse ne fait pas reculer le pourcentage", () => {
    const s = suivi([job(1), job(2), job(3)], { concurrence: () => 2 });
    s.debut(2);
    s.etape(2, "pdf");
    t += 60_000;
    const avant = s.lire().pct;
    jouer(s, 1, 4); // beaucoup plus lent que prévu
    assert.ok(s.lire().pct >= avant);
  });

  it("échec : compté à part, avec sa raison, et le lancement arrive à 100 %", () => {
    const s = suivi([job(1), job(2)]);
    jouer(s, 1);
    s.debut(2);
    s.echec(2, "Visuel introuvable sur le disque");
    s.solder(2); // BullMQ voit le job « réussi » : la première cause est gardée
    const { faits, echecs, jobs } = s.lire();
    assert.deepEqual([faits, echecs], [1, 1]);
    assert.equal(jobs[1].raison, "Visuel introuvable sur le disque");
    s.finir();
    assert.equal(s.lire().pct, 100);
    assert.equal(s.lire().echecs, 1);
  });

  it("échec définitif après tentatives : la raison de la tentative est reprise", () => {
    const s = suivi([job(1)]);
    s.debut(1);
    s.tentativeEchouee(1, "PDF illisible");
    s.echec(1);
    assert.equal(s.lire().jobs[0].etat, "echec");
    assert.equal(s.lire().jobs[0].raison, "PDF illisible");
  });

  it("job terminé pour BullMQ sans avoir été traité : échec « Non traité »", () => {
    const s = suivi([job(1)]);
    s.debut(1);
    s.solder(1);
    assert.equal(s.lire().jobs[0].etat, "echec");
    assert.equal(s.lire().jobs[0].raison, "Non traité");
    s.fait(1); // trop tard : un état final ne bouge plus
    assert.equal(s.lire().faits, 0);
  });

  it("annulation : les jobs retirés sortent du total et la barre ne recule pas", () => {
    const s = suivi([job(1), job(2), job(3)]);
    s.debut(1);
    s.etape(1, "pdf");
    t += 40_000;
    const avant = s.lire().pct;
    s.annule(2);
    s.annule(3);
    const apres = s.lire();
    assert.equal(apres.annules, 2);
    assert.ok(apres.pct > avant);
  });

  it("temps restant : inconnu au départ, réparti sur les places, recalé sur la vitesse réelle", () => {
    const s = suivi([job(1), job(2), job(3)], { concurrence: () => 2 });
    assert.equal(s.lire().resteMs, null);
    jouer(s, 1);
    const parJob = Object.values(dureesAttendues({}, 100 * MO)).reduce((a, b) => a + b, 0);
    // 2 jobs sur 2 places : la durée d'un seul, plus les étiquettes.
    proche(s.lire().resteMs / 1000, parJob + 2 + 0.3 * 3, 1);

    t = 1_000_000;
    const lent = suivi([job(1), job(2), job(3)], { concurrence: () => 2 });
    jouer(lent, 1, 3);
    assert.ok(lent.lire().resteMs / 1000 > parJob * 1.8);
  });

  it("vitesse et plafond : le navigateur peut prolonger sans dépasser l'étape", () => {
    const s = suivi([job(1)]);
    s.debut(1);
    s.etape(1, "pdf");
    t += 10_000;
    const { pct, vitesse, plafond, jobs } = s.lire();
    assert.ok(vitesse > 0);
    assert.ok(plafond > pct && plafond < 100);
    assert.ok(jobs[0].vitesse > 0 && jobs[0].plafond > jobs[0].av);
    const predit = Math.min(plafond, pct + vitesse * 5);
    t += 5_000;
    proche(s.lire().pct, predit, 0.2);
    t += 10_000_000;
    proche(s.lire().pct, plafond, 0.1);
  });

  it("garde la durée réelle de chaque étape et le JPG livré", () => {
    const s = suivi([job(1)]);
    s.debut(1);
    s.etape(1, "pdf");
    t += 12_000;
    s.etape(1, "jpg");
    t += 3_000;
    s.jpg(1, "public/PRINTSA#x/a.jpg");
    s.etape(1, "depot");
    const j = s.lire().jobs[0];
    assert.deepEqual(j.reels, { pdf: 12, jpg: 3 });
    assert.equal(j.jpg, "public/PRINTSA#x/a.jpg");
    assert.equal(j.mo, 100);
  });

  it("étiquettes seules : aucun job à suivre, phase étiquettes", () => {
    const s = suivi([job(1), job(2)], { etiquettesSeules: true });
    const etat = s.lire();
    assert.equal(etat.phase, "etiquettes");
    assert.equal(etat.etiquettesSeules, true);
    s.finir();
    assert.equal(s.lire().pct, 100);
    assert.equal(s.lire().faits, 2);
  });

  it("étiquettes seules en erreur : jobs non comptés comme faits", () => {
    const s = suivi([job(1)], { etiquettesSeules: true });
    s.finir({ erreur: "Mongo HS" });
    assert.equal(s.lire().faits, 0);
    assert.equal(s.lire().avertissement, "Mongo HS");
  });

  it("fin sur erreur : les jobs non démarrés sont annulés, l'avertissement est gardé", () => {
    const s = suivi([job(1), job(2)]);
    jouer(s, 1);
    s.finir({ erreur: "Redis injoignable" });
    const { annules, avertissement } = s.lire();
    assert.equal(annules, 1);
    assert.equal(avertissement, "Redis injoignable");
  });

  it("un id inconnu est ignoré", () => {
    const s = suivi([job(1)]);
    s.debut(99);
    s.etape(99, "pdf");
    s.fait(99);
    assert.equal(s.lire().faits, 0);
  });
});
