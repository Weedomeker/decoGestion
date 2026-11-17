/*
  Copie de « session Tauro Asanti/regles-tauro.js » (garder les deux versions alignées).
  Écart decoGestion : job() reprend l.cle telle quelle quand elle est fournie (ex. « id:42 »).

  regles-tauro.js
  Règles de nommage et d'ordre de production des jobs Tauro H3300 / Asanti
  (voir REGLES_Nommage_et_Ordre_Tauro.md). Module sans dépendance, réutilisable
  tel quel dans decoGestion :

    const regles = require("./regles-tauro");
    const jobs = regles.construireSession(lignes, { code: "S1011A", depart: 1 });

  Nom d'un job :
    <ordre 3 chiffres>_S<jjmm><lettre>_<Dibond>[_W]_<MAT|BRI>_<commande>_<VISUEL>_<ex>
    ex. 001_S1011A_151x260_MAT_169180_JARDIN-SECRET-GAUCHE-150x255_4   (4 ex.)
    Le nombre d'ex. est TOUJOURS le dernier élément (« _4 ») : Asanti le lit pour le nombre de copies par visuel.
*/
"use strict";

// Hot folders Asanti connus (\\192.168.1.72\HotFolderRoot)
const HOT_FOLDERS = [
  "Deco_Std_100x205", "Deco_Std_101x205", "Deco_Std_101x215", "Deco_Std_125x250", "Deco_Std_125x260",
  "Deco_Std_126x260", "Deco_Std_150x300", "Deco_Std_150x305", "Deco_Std_151x260",
];
const HOT_FOLDER_BLANC = "Prod avec BLANC";

/** "POSÉIDON DROITE 125X210" -> "POSEIDON-DROITE-125x210" ; retire +BLANC, MAT, BRILLANT, réf. article (6+ chiffres) */
function visuel(texte) {
  let d = String(texte || "").replace(/\+\s*BLANC/gi, " ");
  d = d.normalize("NFD").replace(/\p{Mn}/gu, "").toUpperCase();
  d = d.replace(/(\d+)\s*X\s*(\d+)/g, "$1x$2");
  const mots = d.split(/\s+/).filter((m) => m && !/^(MAT|BRILLANT)$/i.test(m) && !/^\d{6,}$/.test(m));
  return mots.join("-").replace(/[^\p{L}\p{N}_-]/gu, "").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Date et lettre de session d'après le nom de l'export CSV, ou null.
 *   commandes_2026-11-10.csv     -> { date: "2026-11-10", lettre: "A" }
 *   commandes_2026-11-10 (1).csv -> B   (2e téléchargement du navigateur), (2) -> C…
 *   commandes_2026-11-10_B.csv   -> B   (lettre explicite) ; _2 -> B
 */
function infoSession(nomFichier) {
  const m = /^commandes_(\d{4}-\d{2}-\d{2})(.*)\.csv$/i.exec(nomFichier);
  if (!m) return null;
  const suffixe = m[2].trim();
  let lettre = "A", x;
  if ((x = /^\((\d+)\)$/.exec(suffixe))) lettre = String.fromCharCode(65 + Number(x[1]));
  else if ((x = /^[_ -]+([A-Za-z])$/.exec(suffixe))) lettre = x[1].toUpperCase();
  else if ((x = /^[_ -]+(\d+)$/.exec(suffixe))) lettre = String.fromCharCode(64 + Number(x[1]));
  return { date: m[1], lettre };
}

/** "2026-11-10", "A" -> "S1011A" */
function codeSession(date, lettre) {
  if (!/^[A-Z]$/.test(lettre)) throw new Error(`Lettre de session invalide : ${lettre} (A à Z)`);
  return "S" + date.slice(8, 10) + date.slice(5, 7) + lettre;
}

/**
 * Clé d'une ligne : « commande/sous-dossier » (ex. 169576/01), identifiant stable d'un visuel dans
 * decoGestion / Gamsys. Sans sous-dossier (saisie manuelle), repli sur le nom du job sans session
 * (« nom:151x260_MAT_169180_JARDIN-SECRET-GAUCHE-150x255 »), comme les anciennes lignes du journal.
 */
function cleLigne(l, nom) {
  const sd = String(l.sousDossier ?? "").trim();
  return sd ? `${String(l.cmd ?? "").trim()}/${sd}` : `nom:${nomSansSession(nom)}`;
}

/**
 * Une commande -> un job (sans n° d'ordre).
 * l = { cmd, deco, fmtVis, dibond, finition, ex [, prodBlanc, sousDossier, id] }
 * prodBlanc (booléen, comme dans decoGestion) décide du blanc ; sinon « texture » dans la finition
 * ou +BLANC dans le décor.
 */
function job(l, code) {
  const dibond = String(l.dibond || "").trim();
  const finTxt = String(l.finition || "").trim();
  const blanc = typeof l.prodBlanc === "boolean"
    ? (l.prodBlanc ? "W" : "N")
    : /texture/i.test(finTxt) || /\+\s*BLANC/i.test(l.deco || "") ? "W" : "N";             // « texture Pierre » = avec blanc
  const fin = /brillant/i.test(finTxt) ? "BRI" : "MAT";                                    // non précisé = Mat
  const hfFormat = `Deco_Std_${dibond}`;
  const hfConnu = HOT_FOLDERS.includes(hfFormat);
  const cmd = String(l.cmd || "").trim();
  const ex = Number.parseInt(l.ex, 10);
  const exOk = Number.isFinite(ex) && ex >= 1;
  // Nombre d'ex. en dernier (« _4 ») : lu par Asanti pour le nombre de copies du visuel
  const nom = [code, dibond + (blanc === "W" ? "_W" : ""), fin, cmd, visuel(`${l.deco} ${l.fmtVis}`)].join("_").replace(/_+$/, "") +
    (exOk ? `_${ex}` : "");
  return {
    job: nom,
    cle: typeof l.cle === "string" && l.cle ? l.cle : cleLigne(l, nom),   // clé explicite reprise telle quelle
    id: l.id,
    sousDossier: String(l.sousDossier ?? "").trim(),
    cmd,
    decor: String(l.deco || "").trim(),
    fmtVis: String(l.fmtVis || "").trim(),
    format: dibond,
    hf: blanc === "W" ? HOT_FOLDER_BLANC : hfConnu ? hfFormat : "? (à définir)",
    hfOk: blanc === "W" || hfConnu,
    blanc,
    fin,
    finTxt,
    ex: exOk ? ex : 0,
    ordre: 0,
  };
}

const cmp = (a, b) => String(a).localeCompare(String(b), "fr", { sensitivity: "base" });
function dimensions(fmt) {
  const m = /(\d+)x(\d+)/.exec(fmt || "");
  return m ? [m[1] * m[2], +m[1], +m[2]] : [-1, -1, -1];
}

/**
 * Ordre de production (modifie job.ordre et préfixe job.job du n° sur 3 chiffres) :
 *  1. formats Dibond du plus grand au plus petit (surface, largeur, hauteur) ;
 *  2. le 1er format commence Sans blanc ; à chaque changement de format on reste
 *     sur l'état blanc qui précède (Sans>>Avec | Avec>>Sans | …) ;
 *  3. dans chaque groupe : Mat puis Brillant ;
 *  4. rapprochement des commandes multi-formats : dans chaque groupe, les commandes
 *     qui ont aussi une plaque dans un format précédent passent en tête, celles qui en
 *     ont une dans un format suivant passent en fin (format le plus proche = au plus
 *     près du changement de format) — sans ajouter de changement de format ni de bascule blanc ;
 *     les commandes en fin de groupe sont triées en miroir (n° de commande décroissant) : la jonction
 *     se lit … 169576 169385 169382 169034 | 169034 169382 169385 169576 … ;
 *  5. puis n° de commande (croissant, décroissant en fin de groupe), puis nom.
 * Renvoie le dernier n° attribué.
 */
function ordonner(jobs, depart = 1) {
  const formats = [...new Set(jobs.map((j) => j.format))].sort((a, b) => {
    const x = dimensions(a), y = dimensions(b);
    return y[0] - x[0] || y[1] - x[1] || y[2] - x[2] || cmp(a, b);
  });
  // Formats de chaque commande, pour rapprocher ses plaques au changement de format
  const formatsCmd = new Map();
  for (const j of jobs) (formatsCmd.get(j.cmd) || formatsCmd.set(j.cmd, new Set()).get(j.cmd)).add(j.format);
  // Clé de rapprochement : en tête les commandes déjà vues dans un format précédent (le plus
  // proche d'abord), en fin celles qui reviennent dans un format suivant (le plus proche en dernier)
  const rang = (j) => {
    const i = formats.indexOf(j.format);
    const idx = [...formatsCmd.get(j.cmd)].map((f) => formats.indexOf(f));
    const avant = idx.filter((k) => k < i), apres = idx.filter((k) => k > i);
    if (avant.length) return i - Math.max(...avant) - formats.length;   // < 0 : en tête
    if (apres.length) return formats.length - (Math.min(...apres) - i); // > 0 : en fin
    return 0;
  };
  // Fin de groupe (rang > 0) : n° de commande décroissant, en miroir du début du format suivant
  const triGroupe = (a, b) =>
    (a.fin === "BRI") - (b.fin === "BRI") || rang(a) - rang(b) ||
    (rang(a) > 0 ? -1 : 1) * cmp(a.cmd, b.cmd) || cmp(a.job, b.job);
  let ordre = depart - 1, etat = "S";                                     // le premier format commence Sans blanc
  for (const f of formats) {
    const avec = jobs.filter((j) => j.format === f && j.blanc === "W").sort(triGroupe);
    const sans = jobs.filter((j) => j.format === f && j.blanc !== "W").sort(triGroupe);
    const seq = etat === "W" ? [...avec, ...sans] : [...sans, ...avec];
    for (const j of seq) j.ordre = ++ordre;
    if (seq.length) etat = seq[seq.length - 1].blanc === "W" ? "W" : "S"; // on reste sur l'état qui précède
  }
  // N° d'ordre en tête : un tri alphabétique des noms (RIP) = ordre de production
  for (const j of jobs) j.job = `${String(j.ordre).padStart(3, "0")}_${j.job}`;
  return ordre;
}

/** Lignes de commandes -> jobs nommés et ordonnés. options = { code, depart } */
function construireSession(lignes, { code, depart = 1 }) {
  const jobs = lignes.map((l) => job(l, code));
  // Doublon de nom : le 2e reçoit -2, le 3e -3… AVANT le nombre d'ex., qui reste le dernier élément
  // (VISUEL_4 -> VISUEL-2_4 ; un « _2 » final serait lu par Asanti comme 2 ex.)
  const vus = new Map();
  for (const j of jobs) {
    const n = (vus.get(j.job) || 0) + 1;
    vus.set(j.job, n);
    if (n > 1) j.job = j.job.replace(/(_\d+)?$/, (fin) => `-${n}${fin}`);
  }
  const dernier = ordonner(jobs, depart);
  return { jobs, depart, dernier };
}

// ---------- Découpage en sessions (taille des racks) ----------

/** Session : 50 ex. (décidé le 13/11/2026) — Mat : exactement 50 depuis le 16/11/2026 ; Brillant : au plus près de 50. */
const EX_SESSION = 50;
/** Maximum d'un rack (60 ex.) et minimum d'une dernière session (40 ex.) */
const EX_MIN = 40, EX_MAX = 60;
/** Brillant (16/11/2026) : session à part, seulement à partir de 20 ex. (au plus près de 50, 60 max.) ;
 *  en dessous, rien ne part en session — l'utilisateur peut lancer hors session. Valeur à ajuster ici. */
const EX_MIN_BRILLANT = 20;
/** Bornes : 50 -> min 40, max 60 ; une autre cible (--ex-session, essais) garde les mêmes proportions. */
const bornesSession = (cible = EX_SESSION) => cible === EX_SESSION
  ? { cible, min: EX_MIN, max: EX_MAX }
  : { cible, min: Math.round((cible * EX_MIN) / EX_SESSION), max: Math.round((cible * EX_MAX) / EX_SESSION) };

const exDe = (unites) => unites.reduce((t, u) => t + u.ex, 0);

/**
 * Remplit des sessions avec les unités (commandes entières, dans l'ordre reçu).
 *
 * MAT (exact = true, décidé le 16/11/2026) : une session fait EXACTEMENT « cible » ex. (50).
 *   Les commandes sont prises dans l'ordre ; une commande qui ferait dépasser 50 est sautée (une plus petite,
 *   arrivée après, la remplace) et reste disponible pour la session suivante. Une session qui n'arrive pas
 *   à 50 n'est pas prise en compte : ses commandes sont renvoyées dans « reste » (non lancées, pas gardées).
 *   (2000 lancements simulés de 30 à 200 ex. : 100 % des sessions à 50 ex., 71 % des ex. lancés à chaque lancement.)
 *
 * BRI (tout = true, lancement décidé par l'opérateur) : tout part. Chaque session s'arrête au plus près de la cible
 *   (une commande qui ferait dépasser la cible n'est prise que si elle en rapproche ; égalité : prise ; jamais
 *   au-delà de max) et le reste forme une dernière session quelle que soit sa taille (130 ex. -> 50 + 50 + 30).
 *
 * Sans exact ni tout (essais) : au plus près de la cible, minimum min, le reste n'est pas lancé.
 */
function remplir(unites, { cible, min, max }, { tout = false, exact = false } = {}) {
  const ordre = new Map(unites.map((u, i) => [u, i]));
  let reste = [...unites];
  const paquets = [];
  if (exact && !tout) {
    // Session de « cible » ex. exactement, dès qu'une combinaison de commandes le permet, en gardant les premières
    // de la sélection de l'utilisateur : peut[i][s] = on peut faire s ex. avec les commandes i et suivantes ; on parcourt dans l'ordre
    // de la sélection et on prend chaque commande tant qu'un complément exact reste possible avec les suivantes.
    while (exDe(reste) >= cible) {
      const n = reste.length;
      const peut = Array.from({ length: n + 1 }, () => new Uint8Array(cible + 1));
      peut[n][0] = 1;
      for (let i = n - 1; i >= 0; i--)
        for (let s = 0; s <= cible; s++)
          peut[i][s] = peut[i + 1][s] || (s >= reste[i].ex && peut[i + 1][s - reste[i].ex]) ? 1 : 0;
      if (!peut[0][cible]) break;                                           // aucune combinaison ne fait 50
      const p = { unites: [], ex: 0 }, garde = [];
      for (let i = 0; i < n; i++) {
        const besoin = cible - p.ex - reste[i].ex;
        if (besoin >= 0 && peut[i + 1][besoin]) { p.ex += reste[i].ex; p.unites.push(reste[i]); } else garde.push(reste[i]);
      }
      paquets.push(p);
      reste = garde;
    }
    return { paquets, reste };
  }
  while (reste.length) {
    const p = { unites: [], ex: 0 };
    for (let i = 0; i < reste.length && p.ex < cible; ) {
      const avec = p.ex + reste[i].ex;
      if (avec > max) { i++; continue; }                                        // ne rentre pas dans ce rack
      if (avec > cible && p.ex >= min && avec - cible > cible - p.ex) break;      // plus près de la cible sans elle
      p.ex = avec;
      p.unites.push(...reste.splice(i, 1));
    }
    if (!p.unites.length) { p.unites.push(reste.shift()); p.ex = p.unites[0].ex; }  // plaque seule plus grosse qu'un rack
    if (p.ex < min && !tout) { reste = [...reste, ...p.unites].sort((a, b) => ordre.get(a) - ordre.get(b)); break; }
    paquets.push(p);
  }
  return { paquets, reste };
}

/**
 * Découpe les commandes d'un lancement en sessions d'environ « exSession » ex. (racks) :
 *  - un lancement = UNE finition (décidé le 16/11/2026) : MAT par défaut, BRI sur décision de l'opérateur
 *    (finition = "BRI", option --brillants) ; l'autre finition est IGNORÉE (ni lancée, ni mise en attente) ;
 *  - une commande reste entière dans sa session (sauf si elle dépasse à elle seule le maximum) ;
 *  - remplissage dans l'ordre des lignes reçues = l'ordre de la sélection de l'utilisateur (pas de tri par ancienneté) ;
 *    chaque session est ensuite ordonnée du plus grand au plus petit format (ordonner) ;
 *  - MAT : sessions de EXACTEMENT 50 ex. ; ce qui ne fait pas une session complète N'EST PAS LANCÉ et n'est pas gardé :
 *    l'opérateur lancera lui-même une nouvelle session plus tard (nouvel export) ;
 *  - BRI : session à part, seulement s'il y a assez d'ex. : au moins EX_MIN_BRILLANT (20), au plus près de 50,
 *    jamais plus de 60 ; le reste n'est pas lancé (signalé) — l'utilisateur peut le lancer hors session.
 * Lettres de session à partir de « lettre », n° d'ordre continus à partir de « depart ».
 * Renvoie { finition, sessions: [{ code, lettre, fin, ex, lignes, jobs, depart, dernier }], exclus, ignores, bornes, lettreSuivante, suivant }
 * (sessions[i].jobs[k] correspond à sessions[i].lignes[k] ; exclus[k].ligne / ignores[k].ligne = ligne d'origine).
 *   exclus  : de la finition lancée, mais pas lancés (pas de quoi faire une session de 50 ex.) ;
 *   ignores : de l'autre finition.
 */
// exMinBrillant : minimum d'une session Brillant, réglable dans l'aperçu decoGestion (défaut EX_MIN_BRILLANT)
function decouperSessions(lignes, { date, lettre = "A", depart = 1, exSession = EX_SESSION, bornes = null, finition = "MAT", exMinBrillant = EX_MIN_BRILLANT }) {
  const b = bornes || bornesSession(exSession);
  const fin = String(finition).toUpperCase();
  if (fin !== "MAT" && fin !== "BRI") throw new Error(`Finition de lancement invalide : ${finition} (MAT ou BRI)`);
  const items = lignes.map((l, i) => ({ l, i, j: job(l, "") }));
  const sessions = [], exclus = [], ignores = [];
  let lettreCode = lettre.toUpperCase().charCodeAt(0), n = depart;
  const horsSession = (x, raison) => ({ ...x.j, job: x.j.job.replace(/^_/, ""), ordre: null, session: null, raison, ligne: x.l });
  const exclure = (u, raison) => { for (const x of u.items) exclus.push(horsSession(x, raison)); };

  const autre = fin === "MAT" ? "BRI" : "MAT";
  for (const x of items.filter((y) => y.j.fin !== fin))
    ignores.push({ ...horsSession(x, `${autre} : ignoré — lancement ${fin}`), ignore: true });

  {
    const groupe = items.filter((x) => x.j.fin === fin);
    // Unités = commandes entières, dans l'ordre reçu. Une commande plus grosse qu'une session
    // (Mat : plus de 50 ex. ; Brillant : plus d'un rack, 60 ex.) est éclatée en plaques.
    const exact = fin === "MAT";
    const limite = exact ? b.cible : b.max;
    const parCmd = new Map();
    for (const x of groupe) (parCmd.get(x.j.cmd) || parCmd.set(x.j.cmd, []).get(x.j.cmd)).push(x);
    const unites = [...parCmd]
      .map(([cmd, xs]) => ({ cmd, items: xs, ex: xs.reduce((t, x) => t + x.j.ex, 0) }))
      .flatMap((u) => (u.ex > limite ? u.items.map((x) => ({ cmd: u.cmd, items: [x], ex: x.j.ex })) : [u]));
    const total = exDe(unites);
    const bf = exact ? b : { ...b, min: Math.min(exMinBrillant, b.cible) };          // Brillant : minimum plus bas
    const { paquets, reste } = remplir(unites, bf, { exact });
    const exReste = exDe(reste);
    for (const u of reste)
      exclure(u, exact
        ? (u.ex > b.cible ? `${fin} : plaque de ${u.ex} ex., plus qu'une session de ${b.cible} ex. — non lancé, à voir par l'opérateur`
          : total < b.cible ? `${fin} : seulement ${total} ex. (une session Mat = ${b.cible} ex.) — non lancé, à relancer par l'opérateur`
          : `${fin} : ${exReste} ex. restants, pas de quoi faire une session de ${b.cible} ex. — non lancé, à relancer par l'opérateur`)
        : `${fin} : ${exReste} ex. restants (minimum ${bf.min} pour une session Brillant) — non lancé, à relancer par l'opérateur ou hors session`);
    for (const p of paquets) {
      const l = String.fromCharCode(lettreCode++);
      if (l > "Z") throw new Error("Plus de 26 sessions dans la journée (lettres A à Z)");
      const code = codeSession(date, l);
      const lignesS = p.unites.flatMap((u) => u.items).sort((x, y) => x.i - y.i).map((x) => x.l);
      const r = construireSession(lignesS, { code, depart: n });
      for (const j of r.jobs) j.session = code;
      sessions.push({ code, lettre: l, fin, ex: p.ex, lignes: lignesS, jobs: r.jobs, depart: n, dernier: r.dernier });
      n = r.dernier + 1;
    }
  }
  return { finition: fin, sessions, exclus, ignores, bornes: b, lettreSuivante: String.fromCharCode(lettreCode), suivant: n };
}

/** Nom d'un job sans n° d'ordre, ni session, ni nombre d'ex. (« 151x260_MAT_169180_JARDIN-SECRET-GAUCHE-150x255 ») :
 *  sert à reconnaître une ligne déjà envoyée dans le journal, quelle que soit sa session
 *  (y compris les anciennes lignes, nommées avant l'ajout du nombre d'ex. le 16/11/2026). */
const nomSansSession = (nom) => String(nom).replace(/^\d{3}_S\d{4}[A-Z]_/, "").replace(/^_/, "").replace(/_\d+$/, "");

module.exports = {
  HOT_FOLDERS, HOT_FOLDER_BLANC, EX_SESSION, EX_MIN_BRILLANT, visuel, infoSession, codeSession, cleLigne, job, ordonner, construireSession,
  bornesSession, remplir, decouperSessions, nomSansSession,
};
