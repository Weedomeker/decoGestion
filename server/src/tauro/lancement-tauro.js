/*
  Copie de « session Tauro Asanti/lancement-tauro.js » (garder les deux versions alignées).
  Écarts decoGestion (en plus de la version d'origine) :
    - mode "session" (défaut) | "hors-session" : hors session = PDF sous leur nom d'origine (nomOrigine),
      Mat et Brillant ensemble, aucune règle de session, ni lettre ni n° (lettreSuivante / suivant inchangés) ;
      le retour contient alors { mode, horsSession } et sessions / restants / ignores sont vides ;
    - nomOrigine(l) : l.nomOrigine, sinon nom du PDF (l.pdf) sans dossier ni « .pdf », sinon "" ;
    - l.clesJournal : toutes les clés que couvre une ligne (défaut [j.cle]) pour les contrôles « déjà lancé »,
      « en double » et l'alerte « commande en partie lancée » ; ligneJournal reste mono-clé
      (l'inscription multi-clés est faite par le journal decoGestion).

  lancement-tauro.js
  Préparation d'un lancement Tauro H3300 à partir de la FILE DE JOBS DE decoGestion
  (state.jobs.jobs) — module sans dépendance ni accès disque, prévu pour être appelé tel quel
  dans decoGestion (runJobs) le jour où les règles y seront intégrées :

    const { depuisDecoGestion, preparerLancement } = require("./lancement-tauro");
    const lignes = state.jobs.jobs.map(depuisDecoGestion);
    const plan = preparerLancement(lignes, { date: "2026-11-13", journal });
    // plan.sessions[i].jobs[k] : { job (nom), hf (hot folder), ordre, ... } ; plan.sessions[i].lignes[k].source = job decoGestion

  IMPORTANT — le nouveau nom ne sert QU'AU FICHIER DÉPOSÉ DANS LE HOT FOLDER :
    - ce module ne modifie jamais les jobs reçus (visuel, writePath, jpgName… restent ceux de decoGestion) ;
    - dans decoGestion (processJob), la variable fileName sert aussi au texte imprimé sur la plaque
      (modifyPdf -> drawText), au nom du JPG, au dossier de vernis (checkVernis) et au libellé des sur-mesure :
      elle ne doit PAS changer. Seul le nom de destination du dépôt change :
        deliverToHotFolder(stagedPdfPath, path.join(job.writePath, `${nomTauro}.pdf`))   // au lieu de pdfBaseName
    - les fichiers d'origine (visuPath) ne sont jamais renommés, déplacés ni modifiés.

  Ce que fait un lancement :
    - ordre, noms et sessions (racks) selon regles-tauro.js (REGLES_Nommage_et_Ordre_Tauro.md) ;
    - lettre de session et n° d'ordre repris après ce qui a déjà été lancé le même jour (journal) ;
    - une ligne est identifiée par « commande/sous-dossier » (clé stable decoGestion / Gamsys), jamais par son nom :
      une ligne modifiée avant son lancement reste UNE ligne (pas de doublon) ;
    - BLOQUÉ (jamais lancé automatiquement, raison affichée) :
        · une ligne déjà lancée (journal), identique ou modifiée depuis (ex., visuel, format, blanc, finition) :
          le PDF est déjà dans le RIP → l'opérateur décide (option relancer) ;
        · une même commande/sous-dossier présente deux fois dans l'export ;
    - ALERTE (lancé quand même) : commande dont d'autres plaques ont déjà été lancées ;
    - un lancement = UNE finition : Mat par défaut, Brillant sur décision de l'opérateur (finition "BRI") ;
      l'autre finition est ignorée ;
    - ce qui n'est pas lancé (reste trop petit, racks pleins) n'est PAS gardé de côté : l'opérateur
      lancera lui-même une nouvelle session plus tard (decoGestion garde le job dans sa propre file).
*/
"use strict";
const regles = require("./regles-tauro");

// ---------- Job decoGestion -> ligne ----------

/** Finition d'après le nom du visuel, comme checkVernis de decoGestion (config vernis : MAT, Brillant). Défaut : Mat. */
const finitionDe = (nom) => (/brillant/i.test(String(nom || "")) ? "Brillant" : "Mat");

/**
 * Décor lisible depuis le nom de fichier decoGestion :
 * « JARDIN SECRET 150X255 GAUCHE 94964359 MAT.pdf » -> « JARDIN SECRET GAUCHE »
 * (retire extension, dimensions, réf. article, finition, +BLANC)
 */
function decorDepuisFichier(fichier) {
  return String(fichier || "")
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/\+\s*BLANC/gi, " ")
    .split(/\s+/)
    .filter((m) => m && !/^\d+\s*x\s*\d+$/i.test(m) && !/^\d{6,}$/.test(m) && !/^[A-Z]+-\d{6}$/i.test(m) && !/^(MAT|BRILLANT)$/i.test(m))
    .join(" ");
}

/**
 * Job de la file decoGestion (createJob, jobsList.js) -> ligne pour les règles.
 * Champs lus : _id, date, cmd, sousDossier, visuel, visuPath, format_visu, format_Plaque, prodBlanc, ex.
 */
function depuisDecoGestion(j) {
  return {
    id: j._id,
    date: j.date ? new Date(j.date).toISOString() : "",
    cmd: String(j.cmd ?? ""),
    sousDossier: String(j.sousDossier ?? ""),
    deco: decorDepuisFichier(j.visuel),
    fmtVis: String(j.format_visu || ""),
    dibond: String(j.format_Plaque || "").split("_").pop(),
    finition: finitionDe(j.visuel),
    prodBlanc: !!j.prodBlanc,
    ex: j.ex,
    pdf: j.visuPath || "",
    source: j,
  };
}

/** Nom d'origine d'une ligne (hors session) : l.nomOrigine, sinon le nom du PDF sans dossier ni .pdf, sinon "" */
function nomOrigine(l) {
  if (typeof l.nomOrigine === "string" && l.nomOrigine) return l.nomOrigine;
  const pdf = String(l.pdf || "").trim();
  return pdf ? pdf.split(/[\\/]/).pop().replace(/\.pdf$/i, "") : "";
}

// ---------- Journal des lancements ----------

/** Colonnes du journal (CSV « ; ») — les anciennes lignes n'ont que les 5 premières. */
const COLONNES_JOURNAL = ["date", "job", "hot folder", "source", "octets", "cle", "ex", "signature"];

/** Contenu d'un job, pour voir s'il a changé depuis son lancement : format|blanc|finition|visuel */
const signature = (j) => [j.format, j.blanc, j.fin, regles.visuel(`${j.decor} ${j.fmtVis}`)].join("|");

/** Ligne de journal pour un job lancé (j = job des règles avec son nom définitif) */
function ligneJournal(j, { date = new Date().toISOString(), source = "", octets = "" } = {}) {
  return [date, j.job, j.hf, source, octets, j.cle, j.ex, signature(j)].map((v) => String(v ?? "").replace(/[;\r\n]/g, " ")).join(";");
}

/** Texte du journal -> [{ date, job, hf, source, octets, cle, ex, signature, cmd }] */
function lireJournal(texte) {
  const lignes = String(texte || "").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  if (!lignes.length) return [];
  const entetes = lignes[0].split(";");
  const col = (nom) => entetes.indexOf(nom);
  return lignes.slice(1).map((l) => {
    const v = l.split(";");
    const get = (nom) => (col(nom) >= 0 ? (v[col(nom)] ?? "").trim() : "");
    const job = get("job");
    const cle = get("cle") || `nom:${regles.nomSansSession(job)}`;
    const ex = get("ex");
    return {
      date: get("date"), job, hf: get("hot folder"), source: get("source"), octets: get("octets"),
      cle, ex: ex === "" ? null : Number(ex), signature: get("signature") || null,
      cmd: (/^(\d+)\//.exec(cle) || /_(\d{5,})_/.exec(job) || [])[1] || "",
    };
  }).filter((e) => e.job);
}

// ---------- Lancement ----------

const LIBELLE = { format: "format", blanc: "blanc", fin: "finition", visuel: "visuel" };
const libBlanc = (b) => (b === "W" ? "avec blanc" : "sans blanc");

/** Différences entre ce qui a été lancé (journal) et la ligne actuelle */
function differences(e, j) {
  const d = [];
  if (e.ex != null && Number(e.ex) !== j.ex) d.push(`ex. ${e.ex} → ${j.ex}`);
  if (e.signature) {
    const avant = e.signature.split("|"), apres = signature(j).split("|");
    ["format", "blanc", "fin", "visuel"].forEach((k, i) => {
      if (avant[i] !== apres[i])
        d.push(k === "blanc" ? `${libBlanc(avant[i])} → ${libBlanc(apres[i])}` : `${LIBELLE[k]} ${avant[i]} → ${apres[i]}`);
    });
  }
  return d;
}

const dateFr = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

/** Lettre et n° d'ordre suivants pour le jour (« S1311 ») d'après le journal */
function suiteDuJour(journal, jour) {
  let lettre = "A", depart = 1;
  for (const e of journal) {
    const m = /^(\d{3})_(S\d{4})([A-Z])_/.exec(e.job);
    if (!m || m[2] !== jour) continue;
    if (m[3] >= lettre) lettre = String.fromCharCode(m[3].charCodeAt(0) + 1);
    if (+m[1] >= depart) depart = +m[1] + 1;
  }
  return { lettre, depart };
}

/** Ancien tri par ancienneté (date, puis n° de commande) — plus utilisé depuis le 16/11/2026 :
 *  c'est l'utilisateur qui décide des dossiers à lancer, l'ordre de SA sélection est conservé. */
const triFifo = (a, b) =>
  String(a.date || "9999").localeCompare(String(b.date || "9999")) ||
  String(a.cmd).localeCompare(String(b.cmd), "fr", { numeric: true }) ||
  String(a.sousDossier || "").localeCompare(String(b.sousDossier || ""), "fr", { numeric: true });

/**
 * lignes : la sélection de l'utilisateur (depuisDecoGestion, ou lignes de l'export CSV), dans SON ordre :
 *   c'est l'utilisateur qui décide des dossiers à lancer ; les sessions de 50 ex. sont formées dans cet ordre.
 * o = { date "AAAA-MM-JJ", journal (lireJournal), exSession, bornes { cible, min, max }, exMinBrillant (aperçu decoGestion), finition "MAT" | "BRI" (ou brillants: true = "BRI"),
 *       relancer [clés ou n° de commande], lettre, depart (forcer) }
 * Renvoie { date, finition, premiereLettre, sessions, restants, ignores, bloques, alertes, bornes, lettreSuivante, suivant }
 *   restants : de la finition lancée, non lancés (reste trop petit, racks pleins) — PAS gardés, l'opérateur relancera ;
 *   ignores  : de l'autre finition ;
 *   bloques  : non lancés, décision de l'opérateur nécessaire ;
 *   (restants[k], ignores[k] et bloques[k] : job des règles + raison + ligne d'origine)
 */
function preparerLancement(lignes, o = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date || "")) throw new Error(`Date de lancement invalide : ${o.date}`);
  const mode = o.mode || "session";
  if (mode !== "session" && mode !== "hors-session") throw new Error(`Mode de lancement invalide : ${mode}`);
  const horsSessionMode = mode === "hors-session";
  const journal = o.journal || [];
  const jour = regles.codeSession(o.date, "A").slice(0, 5);
  const suite = suiteDuJour(journal, jour);
  const lettre = (o.lettre || suite.lettre).toUpperCase();
  const depart = o.depart > 0 ? o.depart : suite.depart;

  // Index du journal : par clé (commande/sous-dossier, ou nom pour les anciennes lignes), par nom, par commande
  const parCle = new Map(), parNom = new Map(), parCmd = new Map();
  for (const e of journal) {
    parCle.set(e.cle, e);
    // Repli par nom : seulement pour les anciennes lignes sans clé (deux sous-dossiers d'une même
    // commande peuvent porter le même visuel et ne doivent pas se bloquer l'un l'autre)
    if (e.cle.startsWith("nom:")) parNom.set(regles.nomSansSession(e.job), e);
    if (e.cmd) (parCmd.get(e.cmd) || parCmd.set(e.cmd, []).get(e.cmd)).push(e);
  }
  const relancer = new Set((o.relancer || []).map(String));
  const finition = o.finition ? String(o.finition).toUpperCase() : o.brillants ? "BRI" : "MAT";

  // L'autre finition est écartée avant tout contrôle (ni bloquée, ni signalée : elle n'est pas concernée)
  // Ordre de la sélection de l'utilisateur (export / file decoGestion) conservé tel quel : pas de priorité d'ancienneté
  const tries = [...lignes].map((l) => ({ l, j: regles.job(l, "") }));
  // Hors session : aucun filtre de finition (Mat et Brillant partent ensemble)
  const items = horsSessionMode ? tries : tries.filter(({ j }) => j.fin === finition);
  const ignores = horsSessionMode ? [] : regles.decouperSessions(tries.filter(({ j }) => j.fin !== finition).map(({ l }) => l), { date: o.date, finition }).ignores;
  // Clés couvertes par une ligne (par défaut la sienne) ; une clé partagée par deux lignes les bloque toutes les deux
  const clesDe = (l, j) => [...new Set(Array.isArray(l.clesJournal) && l.clesJournal.length ? l.clesJournal.map(String) : [j.cle])];
  const nbParCle = new Map();
  for (const { l, j } of items) for (const c of clesDe(l, j)) nbParCle.set(c, (nbParCle.get(c) || 0) + 1);

  const aLancer = [], bloques = [], alertes = [];
  const bloquer = (l, j, raison) =>
    bloques.push({ ...j, job: j.job.replace(/^_/, ""), ordre: null, session: null, raison, ligne: l, bloque: true });

  for (const { l, j } of items) {
    if (!(j.ex >= 1)) {
      bloquer(l, j, `nombre d'ex. invalide (« ${l.ex ?? ""} ») — à corriger dans la commande`);
      continue;
    }
    const cles = clesDe(l, j);
    const partagee = cles.find((c) => nbParCle.get(c) > 1);
    if (partagee) {
      bloquer(l, j, `en double dans l'export (${partagee}) — supprimer l'un des deux`);
      continue;
    }
    const e = cles.map((c) => parCle.get(c)).find(Boolean) || parNom.get(regles.nomSansSession(j.job));
    if (e && !cles.some((c) => relancer.has(c)) && !relancer.has(j.cmd)) {
      const d = differences(e, j);
      bloquer(l, j, `déjà lancé le ${dateFr(e.date)} (${e.job})${d.length ? ` — MODIFIÉ depuis : ${d.join(", ")}` : " — identique"} : à confirmer (relancer ${j.cle.startsWith("nom:") ? j.cmd : j.cle})`);
      continue;
    }
    // Commande d'une clé = préfixe « 169034/ » ; clé « nom: » (ancienne ligne) : cmd de la ligne ; clé « id: » : aucune alerte
    const cmds = [...new Set(cles.map((c) => (/^(\d+)\//.exec(c) || [])[1] || (c.startsWith("nom:") ? j.cmd : null)).filter(Boolean))];
    for (const cmd of cmds) {
      const autres = (parCmd.get(cmd) || []).filter((x) => x !== e);
      // Session : « 001_S1711A » ; hors session (nom d'origine, sans code) : « hors session 169034/01 »
      const quoi = (x) => (/^\d{3}_S\d{4}[A-Z]/.test(x.job) ? x.job.slice(0, 10) : `hors session ${x.cle.replace(/^nom:/, "")}`);
      if (autres.length) alertes.push(`${cmd} : commande déjà en partie lancée (${autres.map(quoi).join(", ")})`);
    }
    aLancer.push(l);
  }

  if (horsSessionMode) {
    const horsSession = aLancer.map((l) => ({ ...regles.job(l, ""), job: nomOrigine(l), session: null, ordre: null, horsSession: true, ligne: l }));
    return {
      date: o.date, mode, finition, premiereLettre: lettre, sessions: [], horsSession, restants: [], ignores: [], bloques,
      alertes: [...new Set(alertes)], bornes: o.bornes || regles.bornesSession(o.exSession), lettreSuivante: suite.lettre, suivant: suite.depart,
    };
  }

  const r = regles.decouperSessions(aLancer, { date: o.date, lettre, depart, exSession: o.exSession, bornes: o.bornes, exMinBrillant: o.exMinBrillant, finition });
  return {
    date: o.date, mode, finition, premiereLettre: lettre, sessions: r.sessions, horsSession: [], restants: r.exclus, ignores, bloques,
    alertes: [...new Set(alertes)], bornes: r.bornes, lettreSuivante: r.lettreSuivante, suivant: r.suivant,
  };
}

module.exports = {
  finitionDe, decorDepuisFichier, depuisDecoGestion, nomOrigine,
  COLONNES_JOURNAL, signature, ligneJournal, lireJournal, differences, suiteDuJour, triFifo, preparerLancement,
};
