/*
  Tests du lancement Tauro (copie des tests purs du dossier « session Tauro Asanti »,
  sans les tests dépendant du CSV, de l'instantané ou de la ligne de commande).
*/
"use strict";
const assert = require("node:assert/strict");

const regles = require("../../../server/src/tauro/regles-tauro");
const L = require("../../../server/src/tauro/lancement-tauro");

describe("tauro/lancement", () => {
const ENTETE = L.COLONNES_JOURNAL.join(";");
const journalDe = (jobs, date = "2026-11-13T08:00:00.000Z") =>
  L.lireJournal([ENTETE, ...jobs.map((j) => L.ligneJournal(j, { date }))].join("\n"));
const tousJobs = (plan) => plan.sessions.flatMap((s) => s.jobs);

// Job tel que créé par decoGestion (jobsList.js createJob)
let n = 0;
const dg = (o = {}) => ({
  _id: 1700000000000 + ++n, date: new Date(Date.UTC(2026, 10, 13, 8, n)), client: "LM", ville: "PARIS",
  cmd: 170000 + n, sousDossier: "00", visuel: "ONYX 150x210 DROIT 94963991 MAT.pdf", visuPath: "",
  format_visu: "150x210", format_Plaque: "151x260", prodBlanc: false, ex: 1, ...o,
});
// Lignes au format règles, à partir de decoGestion
const lignesDG = (jobs) => jobs.map(L.depuisDecoGestion);

// ---------------------------------------------------------------------------------------------
// 1. Compatibilité decoGestion
// ---------------------------------------------------------------------------------------------

it("job decoGestion -> nom, hot folder, finition, blanc", () => {
  const plan = L.preparerLancement(lignesDG([
    dg({ cmd: 169180, sousDossier: "01", visuel: "JARDIN SECRET 150X255 GAUCHE 94964359 MAT.pdf", format_visu: "150x255", ex: 35 }),
    dg({ cmd: 169034, sousDossier: "00", visuel: "BETON CLAIR 150x255+BLANC 94964000 MAT.pdf", format_visu: "150x255", prodBlanc: true, ex: 15 }),
    dg({ cmd: 169694, sousDossier: "01", visuel: "GRAVURE NATURE 100x210 DROIT 94960000 BRILLANT.pdf", format_visu: "100x210", format_Plaque: "101x215" }),
  ]), { date: "2026-11-13" });
  const jobs = tousJobs(plan);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].job, "001_S1311A_151x260_MAT_169180_JARDIN-SECRET-GAUCHE-150x255_35");   // 35 ex.
  assert.equal(jobs[0].hf, "Deco_Std_151x260");
  assert.equal(jobs[0].cle, "169180/01");
  assert.equal(jobs[1].job, "002_S1311A_151x260_W_MAT_169034_BETON-CLAIR-150x255_15");
  assert.equal(jobs[1].hf, "Prod avec BLANC");                       // prodBlanc -> hot folder blanc, comme decoGestion
  assert.equal(plan.restants.length, 0);
  assert.equal(plan.ignores.length, 1);                              // lancement Mat : le brillant est ignoré
  assert.equal(plan.ignores[0].fin, "BRI");
  // la ligne garde le job decoGestion d'origine (pour son visuPath, ses étiquettes…)
  assert.equal(plan.sessions[0].lignes[0].source.cmd, 169180);
});

it("nombre d'ex. toujours en dernier dans le nom (« _4 ») : doublon, ancien journal, ex. invalide", () => {
  // nombre d'ex. à la fin, lisible par Asanti
  const [l4] = lignesDG([dg({ cmd: 174444, ex: 4 })]);
  assert.match(regles.job(l4, "S1611A").job, /^S1611A_151x260_MAT_174444_ONYX-DROIT-150x210_4$/);
  // doublon de nom dans une session : -2 AVANT le nombre d'ex. (un « _2 » final serait lu comme 2 ex.)
  const deux = lignesDG([dg({ cmd: 174445, sousDossier: "00", ex: 3 }), dg({ cmd: 174445, sousDossier: "01", ex: 3 })]);
  const s = regles.construireSession(deux, { code: "S1611A" });
  assert.deepEqual(s.jobs.map((j) => j.job).sort(), [
    "001_S1611A_151x260_MAT_174445_ONYX-DROIT-150x210_3", "002_S1611A_151x260_MAT_174445_ONYX-DROIT-150x210-2_3"]);
  // nom sans session ni nombre d'ex. : reconnaît aussi les anciennes lignes du journal (sans « _ex »)
  assert.equal(regles.nomSansSession("007_S1611A_151x260_MAT_174444_ONYX-DROIT-150x210_4"), "151x260_MAT_174444_ONYX-DROIT-150x210");
  assert.equal(regles.nomSansSession("001_S1011A_151x260_MAT_169180_JARDIN-SECRET-GAUCHE-150x255"), "151x260_MAT_169180_JARDIN-SECRET-GAUCHE-150x255");
  // nombre d'ex. invalide : bloqué, jamais envoyé sans nombre de copies
  const p = L.preparerLancement(lignesDG([dg({ ex: 0 }), ...Array.from({ length: 50 }, () => dg())]), { date: "2026-11-16" });
  assert.equal(p.bloques.length, 1);
  assert.match(p.bloques[0].raison, /nombre d'ex\. invalide/);
  assert.ok(tousJobs(p).every((j) => /_\d+$/.test(j.job)));
});

it("format_Plaque préfixé (Deco_Std_126x260) et prodBlanc prioritaire sur le nom", () => {
  const [l] = lignesDG([dg({ format_Plaque: "Deco_Std_126x260", visuel: "CHAUX BEIGE 100x255+BLANC 94964439 MAT.pdf", prodBlanc: false, format_visu: "100x255" })]);
  const j = regles.job(l, "S1311A");
  assert.equal(j.format, "126x260");
  assert.equal(j.blanc, "N");                                        // decoGestion a dit « sans blanc »
  assert.equal(j.hf, "Deco_Std_126x260");
});

// ---------------------------------------------------------------------------------------------
// 2. Règles conservées
// ---------------------------------------------------------------------------------------------

it("racks : sessions de 40 à 60 ex. ; un lancement = une seule finition", () => {
  const jobs = [];
  for (let i = 0; i < 40; i++) jobs.push(dg({ ex: 1 + (i % 4) }));
  for (let i = 0; i < 10; i++) jobs.push(dg({ ex: 3, visuel: "ONYX 150x210 DROIT 94963991 BRILLANT.pdf" }));
  const sans = L.preparerLancement(lignesDG(jobs), { date: "2026-11-13" });
  for (const s of sans.sessions) {
    assert.equal(s.fin, "MAT");
    assert.ok(s.ex >= 40 && s.ex <= 60, `${s.code} : ${s.ex} ex.`);
  }
  assert.equal(sans.finition, "MAT");
  assert.equal(sans.ignores.length, 10);
  assert.ok(sans.ignores.every((j) => j.fin === "BRI" && j.ignore));
  // lancement Brillant : seul le brillant part (en entier, 30 ex.), le Mat est ignoré
  const bri = L.preparerLancement(lignesDG(jobs), { date: "2026-11-13", brillants: true });
  assert.equal(bri.finition, "BRI");
  assert.deepEqual(bri.sessions.map((s) => [s.fin, s.ex]), [["BRI", 30]]);
  assert.equal(bri.ignores.length, 40);
  assert.ok(bri.ignores.every((j) => j.fin === "MAT"));
  assert.equal(bri.restants.length, 0);
});

it("Mat : sessions d'EXACTEMENT 50 ex. ; une session qui n'arrive pas à 50 n'est pas prise en compte", () => {
  const b = regles.bornesSession(50);
  const u = (...ex) => ex.map((e, i) => ({ ex: e, i }));
  const tailles = (r) => r.paquets.map((p) => p.ex);
  const exact = { exact: true };
  // 117 ex. à l'unité : 50 + 50, 17 non lancés
  let r = regles.remplir(u(...Array(117).fill(1)), b, exact);
  assert.deepEqual(tailles(r), [50, 50]);
  assert.equal(r.reste.length, 17);
  // 48 puis 6 (ferait 54) : la commande de 6 est sautée, une de 2 arrivée après complète à 50 ; celle de 6 passe à la suivante
  r = regles.remplir(u(24, 24, 6, 2, 44), b, exact);
  assert.deepEqual(tailles(r), [50, 50]);
  assert.deepEqual(r.paquets[0].unites.map((x) => x.ex), [24, 24, 2]);
  assert.deepEqual(r.paquets[1].unites.map((x) => x.ex), [6, 44]);
  // cas réel du 03/11 (logs decoGestion) : 53 ex. ; prendre dans l'ordre donnait 49 (+4 dépasse) ->
  // on trouve 50 exactement en laissant la commande la plus récente possible (3 ex.)
  r = regles.remplir(u(2, 3, 2, 3, 3, 2, 1, 1, 1, 2, 2, 4, 2, 2, 2, 3, 3, 2, 3, 6, 4), b, exact);
  assert.deepEqual(tailles(r), [50]);
  assert.deepEqual(r.reste.map((x) => x.i), [18]);
  // 49 ex. : aucune session ; 30 + 30 : jamais 50 -> aucune session
  assert.deepEqual(tailles(regles.remplir(u(...Array(49).fill(1)), b, exact)), []);
  assert.deepEqual(tailles(regles.remplir(u(30, 30), b, exact)), []);
  // le reste garde l'ordre de la sélection
  r = regles.remplir(u(30, 30, 20, 5), b, exact);
  assert.deepEqual(tailles(r), [50]);
  assert.deepEqual(r.reste.map((x) => x.i), [1, 3]);
  // Brillant (tout) : tout part, au plus près de 50 (sous 40 on continue : 30 + 30 = 60, un rack)
  assert.deepEqual(tailles(regles.remplir(u(30, 30), b, { tout: true, exact: true })), [60]);
});

it("découpage Mat : commande de plus de 50 ex. éclatée en plaques ; plaque seule de plus de 50 ex. non lancée", () => {
  const grosse = [dg({ cmd: 173333, sousDossier: "00", ex: 30 }), dg({ cmd: 173333, sousDossier: "01", ex: 30 })];
  const plan = L.preparerLancement(lignesDG([...grosse, ...Array.from({ length: 20 }, () => dg({ ex: 1 }))]), { date: "2026-11-13" });
  assert.deepEqual(plan.sessions.map((s) => s.ex), [50]);
  const enorme = L.preparerLancement(lignesDG([dg({ ex: 55 })]), { date: "2026-11-13" });
  assert.equal(enorme.sessions.length, 0);
  assert.match(enorme.restants[0].raison, /plaque de 55 ex\., plus qu'une session de 50 ex\./);
});

it("Brillant : session à part seulement à partir de 20 ex. (au plus près de 50, 60 max.), sinon rien en session", () => {
  const bri = (ex) => dg({ ex, visuel: "ONYX 150x210 DROIT 94963991 BRILLANT.pdf" });
  // 19 ex. : pas de session, signalé
  let p = L.preparerLancement(lignesDG([bri(10), bri(9)]), { date: "2026-11-16", brillants: true });
  assert.equal(p.sessions.length, 0);
  assert.ok(p.restants.every((j) => /minimum 20 pour une session Brillant/.test(j.raison)));
  // 20 ex. : une session de 20
  p = L.preparerLancement(lignesDG([bri(10), bri(10)]), { date: "2026-11-16", brillants: true });
  assert.deepEqual(p.sessions.map((s) => [s.fin, s.ex]), [["BRI", 20]]);
  // 70 ex. : 50 puis 20 ; 65 ex. : 50, et 15 signalés
  p = L.preparerLancement(lignesDG(Array.from({ length: 70 }, () => bri(1))), { date: "2026-11-16", brillants: true });
  assert.deepEqual(p.sessions.map((s) => s.ex), [50, 20]);
  p = L.preparerLancement(lignesDG(Array.from({ length: 65 }, () => bri(1))), { date: "2026-11-16", brillants: true });
  assert.deepEqual(p.sessions.map((s) => s.ex), [50]);
  assert.equal(p.restants.reduce((t, j) => t + j.ex, 0), 15);
});

it("essais / Brillant : sessions au plus près de 50 ex. (jamais gonflées jusqu'à 60 avec le reste)", () => {
  const b = regles.bornesSession(50);
  const u = (...ex) => ex.map((e) => ({ ex: e }));
  const tailles = (r) => r.paquets.map((p) => p.ex);
  // 117 ex. à l'unité : 50 + 50, 17 non lancés (avant : 60 + 57)
  let r = regles.remplir(u(...Array(117).fill(1)), b);
  assert.deepEqual(tailles(r), [50, 50]);
  assert.equal(r.reste.length, 17);
  // 48 puis une commande de 4 : 52 est aussi près que 48 -> prise (égalité) ; 48 puis 6 : 54 plus loin -> s'arrête à 48
  assert.deepEqual(tailles(regles.remplir(u(24, 24, 4), b)), [52]);
  r = regles.remplir(u(24, 24, 6, 40), b);
  assert.deepEqual(tailles(r), [48, 46]);
  // sous le minimum de 40, on continue même si on s'éloigne de 50
  assert.deepEqual(tailles(regles.remplir(u(30, 25), b)), [55]);
  // 140 ex. -> 50 + 50 + 40 ; brillant (tout) : 130 -> 50 + 50 + 30
  assert.deepEqual(tailles(regles.remplir(u(...Array(140).fill(1)), b)), [50, 50, 40]);
  assert.deepEqual(tailles(regles.remplir(u(...Array(130).fill(1)), b, { tout: true })), [50, 50, 30]);
});

it("reste trop petit : non lancé, pas gardé ; le lancement suivant reprend lettre et n° (ordre préservé)", () => {
  // 85 ex. Mat : une session de 50 à 60, le reste (< 40) n'est pas lancé
  const matin = Array.from({ length: 17 }, () => dg({ ex: 5 }));
  const a = L.preparerLancement(lignesDG(matin), { date: "2026-11-13" });
  assert.equal(a.sessions.length, 1);
  assert.ok(a.restants.length > 0 && a.restants.every((j) => /non lancé, à relancer par l'opérateur/.test(j.raison)));
  const journal = journalDe(tousJobs(a));
  // plus tard, l'opérateur lance une nouvelle session avec un nouvel export (decoGestion a gardé les jobs non lancés)
  const lances = new Set(tousJobs(a).map((j) => j.cle));
  const apres = [...matin.filter((j) => !lances.has(`${j.cmd}/${j.sousDossier}`)), ...Array.from({ length: 6 }, () => dg({ ex: 5 }))];
  const b = L.preparerLancement(lignesDG(apres), { date: "2026-11-13", journal });
  assert.equal(b.sessions[0].code, "S1311B");
  assert.equal(b.sessions[0].depart, a.sessions[0].dernier + 1);
  // lancement Brillant ensuite : lettre et n° continuent encore
  const journal2 = journalDe([...tousJobs(a), ...tousJobs(b)]);
  const c = L.preparerLancement(lignesDG([dg({ ex: 25, visuel: "ONYX 150x210 DROIT 94963991 BRILLANT.pdf" })]),
    { date: "2026-11-13", journal: journal2, brillants: true });
  assert.equal(c.sessions[0].code, "S1311C");
  assert.equal(c.sessions[0].depart, b.sessions[b.sessions.length - 1].dernier + 1);
});

it("l'utilisateur décide : la session suit l'ordre de SA sélection, pas l'ancienneté ; le reste est signalé", () => {
  const vieux = dg({ ex: 25, cmd: 179999, date: new Date("2026-11-10T08:00:00Z") });
  const recents = [dg({ ex: 25 }), dg({ ex: 25 })];
  // sélection : les deux récents d'abord, le vieux ensuite -> 50 = les deux récents ; le vieux (25 ex.) est signalé
  const plan = L.preparerLancement(lignesDG([...recents, vieux]), { date: "2026-11-13" });
  assert.deepEqual(plan.sessions.map((s) => s.ex), [50]);
  assert.ok(!plan.sessions[0].jobs.some((j) => j.cmd === "179999"));
  assert.deepEqual(plan.restants.map((j) => j.cmd), ["179999"]);
  // s'il le met en tête de sa sélection, il part
  const plan2 = L.preparerLancement(lignesDG([vieux, ...recents]), { date: "2026-11-13" });
  assert.ok(plan2.sessions[0].jobs.some((j) => j.cmd === "179999"));
});

// ---------------------------------------------------------------------------------------------
// 3. Changements entre deux sessions
// ---------------------------------------------------------------------------------------------

it("lettre et n° d'ordre repris après la session déjà lancée le même jour", () => {
  const a = L.preparerLancement(lignesDG(Array.from({ length: 50 }, () => dg())), { date: "2026-11-13" });
  const journal = journalDe(tousJobs(a));
  const b = L.preparerLancement(lignesDG(Array.from({ length: 50 }, () => dg())), { date: "2026-11-13", journal });
  assert.equal(b.sessions[0].code, "S1311B");
  assert.equal(b.sessions[0].depart, a.sessions[0].dernier + 1);
  // autre jour : on repart à A / 001
  const c = L.preparerLancement(lignesDG(Array.from({ length: 50 }, () => dg())), { date: "2026-11-14", journal });
  assert.equal(c.sessions[0].code, "S1411A");
  assert.equal(c.sessions[0].depart, 1);
});

it("ligne déjà lancée remise dans la file : bloquée (identique), relancée seulement sur demande", () => {
  const j1 = dg({ ex: 50 });
  const a = L.preparerLancement(lignesDG([j1]), { date: "2026-11-13" });
  const journal = journalDe(tousJobs(a));
  const b = L.preparerLancement(lignesDG([j1]), { date: "2026-11-13", journal });
  assert.equal(b.sessions.length, 0);
  assert.equal(b.bloques.length, 1);
  assert.match(b.bloques[0].raison, /déjà lancé .* identique/);
  const c = L.preparerLancement(lignesDG([j1]), { date: "2026-11-13", journal, relancer: [`${j1.cmd}/00`] });
  assert.equal(c.bloques.length, 0);
  assert.equal(c.sessions[0].code, "S1311B");
});

it("ligne déjà lancée puis MODIFIÉE (ex., visuel, blanc) : bloquée avec le détail", () => {
  const j1 = dg({ ex: 50 });
  const journal = journalDe(tousJobs(L.preparerLancement(lignesDG([j1]), { date: "2026-11-13" })));
  const modifie = { ...j1, ex: 48, visuel: "MASSA 150x210 94956921 MAT.pdf", prodBlanc: true };
  const b = L.preparerLancement(lignesDG([modifie]), { date: "2026-11-13", journal });
  assert.equal(b.bloques.length, 1);
  const r = b.bloques[0].raison;
  assert.match(r, /MODIFIÉ/);
  assert.match(r, /ex\. 50 → 48/);
  assert.match(r, /sans blanc → avec blanc/);
  assert.match(r, /visuel ONYX-DROIT-150x210 → MASSA-150x210/);
});

it("même commande/sous-dossier deux fois dans la file (job modifié puis rajouté) : les deux bloqués", () => {
  const j1 = dg({ ex: 2 });
  const j2 = { ...j1, _id: j1._id + 1, visuel: "MASSA 150x210 94956921 MAT.pdf" };
  const plan = L.preparerLancement(lignesDG([j1, j2, ...Array.from({ length: 45 }, () => dg())]), { date: "2026-11-13" });
  assert.equal(plan.bloques.length, 2);
  assert.ok(plan.bloques.every((b) => /en double/.test(b.raison)));
  assert.ok(!tousJobs(plan).some((j) => j.cmd === String(j1.cmd)));
});

it("commande dont une autre plaque est déjà lancée : lancée, avec une information", () => {
  const p1 = dg({ cmd: 171111, sousDossier: "00", ex: 50 });
  const journal = journalDe(tousJobs(L.preparerLancement(lignesDG([p1]), { date: "2026-11-13" })));
  const p2 = dg({ cmd: 171111, sousDossier: "01", ex: 50 });
  const plan = L.preparerLancement(lignesDG([p2]), { date: "2026-11-13", journal });
  assert.equal(plan.bloques.length, 0);
  assert.equal(tousJobs(plan)[0].cle, "171111/01");
  assert.match(plan.alertes[0], /171111 : commande déjà en partie lancée/);
});

it("info « en partie lancée » lisible : code de session, ou « hors session » + clé", () => {
  const deja = dg({ cmd: 171200, sousDossier: "01", visuPath: "C:\\v\\ONYX.pdf" });
  const horsSession = L.preparerLancement(lignesDG([deja]), { date: "2026-11-17", mode: "hors-session" });
  const autre = dg({ cmd: 171200, sousDossier: "02" });
  const plan = L.preparerLancement(lignesDG([autre]), { date: "2026-11-17", mode: "hors-session", journal: journalDe(horsSession.horsSession) });
  assert.match(plan.alertes[0], /171200 : commande déjà en partie lancée \(hors session 171200\/01\)/);
  const session = L.preparerLancement(lignesDG([dg({ cmd: 171300, sousDossier: "01", ex: 50 })]), { date: "2026-11-17" });
  const plan2 = L.preparerLancement(lignesDG([dg({ cmd: 171300, sousDossier: "02" })]), { date: "2026-11-17", mode: "hors-session", journal: journalDe(tousJobs(session)) });
  assert.match(plan2.alertes[0], /\(001_S1711A\)/);
});

it("deux sous-dossiers d'une commande avec le même visuel : l'un lancé ne bloque pas l'autre", () => {
  const p1 = dg({ cmd: 172222, sousDossier: "00", ex: 50 });
  const journal = journalDe(tousJobs(L.preparerLancement(lignesDG([p1]), { date: "2026-11-13" })));
  const p2 = { ...p1, _id: p1._id + 1, sousDossier: "01" };
  const plan = L.preparerLancement(lignesDG([p2]), { date: "2026-11-13", journal });
  assert.equal(plan.bloques.length, 0);
  assert.equal(tousJobs(plan).length, 1);
});

it("ancien journal (5 colonnes, sans clé) : la ligne déjà envoyée est reconnue par son nom", () => {
  const ancien = L.lireJournal([
    "date;job;hot folder;source;octets",
    "2026-11-12T07:34:31.602Z;001_S1011A_151x260_MAT_169180_JARDIN-SECRET-GAUCHE-150x255;Deco_Std_151x260;X:\\a.pdf;1",
  ].join("\n"));
  assert.equal(ancien[0].cmd, "169180");
  const csv = { cmd: "169180", deco: "JARDIN SECRET GAUCHE", fmtVis: "150x255", dibond: "151x260", finition: "Mat", ex: "45" };
  const plan = L.preparerLancement([csv], { date: "2026-11-13", journal: ancien });
  assert.equal(plan.bloques.length, 1);
});

// ---------------------------------------------------------------------------------------------
// 5. Hors session et clés multiples (ajouts decoGestion)
// ---------------------------------------------------------------------------------------------

it("hors session : nom d'origine, Mat et Brillant ensemble, ni lettre ni n°", () => {
  const p = L.preparerLancement(lignesDG([
    dg({ ex: 2, visuPath: "C:\\v\\169304 - LM - 151x260 - ONYX 150x210 MAT 2_EX.pdf" }),
    dg({ ex: 1, visuel: "GRAVURE NATURE 100x210 DROIT 94960000 BRILLANT.pdf", visuPath: "C:\\v\\GRAVURE NATURE.pdf" }),
  ]), { date: "2026-11-17", mode: "hors-session" });
  assert.equal(p.mode, "hors-session");
  assert.deepEqual(p.sessions, []);
  assert.deepEqual(p.horsSession.map((j) => j.job), ["169304 - LM - 151x260 - ONYX 150x210 MAT 2_EX", "GRAVURE NATURE"]);
  assert.deepEqual(p.horsSession.map((j) => j.fin), ["MAT", "BRI"]);
  assert.equal(p.lettreSuivante, "A"); assert.equal(p.suivant, 1);
});

it("hors session au journal : la session suivante garde A et le dossier y est bloqué « identique »", () => {
  const urgent = dg({ ex: 2, visuPath: "C:\\v\\URGENT.pdf" });
  const hs = L.preparerLancement(lignesDG([urgent]), { date: "2026-11-17", mode: "hors-session" });
  const b = L.preparerLancement(lignesDG([urgent, ...Array.from({ length: 50 }, () => dg())]),
    { date: "2026-11-17", journal: journalDe(hs.horsSession) });
  assert.equal(b.sessions[0].code, "S1711A");
  assert.equal(b.sessions[0].depart, 1);
  assert.match(b.bloques[0].raison, /déjà lancé .*\(URGENT\) — identique/);
});

it("réimpression : relancer + hors session ; les autres lignes déjà lancées restent bloquées", () => {
  const j1 = dg({ ex: 25, visuPath: "C:\\v\\A.pdf" }), j2 = dg({ ex: 25, visuPath: "C:\\v\\B.pdf" });
  const journal = journalDe(tousJobs(L.preparerLancement(lignesDG([j1, j2]), { date: "2026-11-17" })));
  const p = L.preparerLancement(lignesDG([j1, j2]), { date: "2026-11-17", mode: "hors-session", journal, relancer: [`${j1.cmd}/00`] });
  assert.deepEqual(p.horsSession.map((j) => j.job), ["A"]);
  assert.equal(p.bloques.length, 1);
});

it("mode invalide : erreur", () => assert.throws(() => L.preparerLancement([], { date: "2026-11-17", mode: "x" }), /Mode de lancement invalide/));

it("clesJournal : une ligne est bloquée si une de ses clés est déjà lancée ; une clé partagée par 2 lignes les bloque", () => {
  const l1 = { ...L.depuisDecoGestion(dg({ cmd: 169034, sousDossier: "01" })), clesJournal: ["169034/01", "169380/02"] };
  const deja = L.preparerLancement([L.depuisDecoGestion(dg({ cmd: 169380, sousDossier: "02", ex: 50 }))], { date: "2026-11-17" });
  const p = L.preparerLancement([l1], { date: "2026-11-17", journal: journalDe(tousJobs(deja)) });
  assert.match(p.bloques[0].raison, /déjà lancé/);
  const l2 = { ...L.depuisDecoGestion(dg({ cmd: 169380, sousDossier: "02" })) };
  assert.equal(L.preparerLancement([l1, l2], { date: "2026-11-17" }).bloques.length, 2);
});

it("clé explicite l.cle : reprise telle quelle, aucune alerte pour id:", () => {
  assert.equal(regles.job({ cmd: "0", cle: "id:42", dibond: "151x260", ex: 1 }, "").cle, "id:42");
});
});
