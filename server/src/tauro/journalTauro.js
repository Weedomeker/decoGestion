/*
  Journal des lancements Tauro dans MongoDB (collection LancementTauro).
  Remplace le fichier CSV de la version d'origine ; le format des entrées est celui de lireJournal.
*/
"use strict";
const LancementTauro = require("../models/LancementTauro");
const regles = require("./regles-tauro");
const { withMongoRetry } = require("../utils/retryMongo");

// Coupure Atlas : l'aperçu et le lancement attendent peu (l'opérateur est devant l'écran) ; le dépôt
// et l'inscription d'un job en cours de traitement attendent plus longtemps (délais par défaut,
// ~2 min), plutôt que d'échouer ou de laisser un PDF déposé sans trace au journal.
const ATTENTE_COURTE = { delaysMs: [1000, 3000] };

const cmdDeCle = (cle) => (/^(\d+)\//.exec(String(cle || "")) || [])[1] || "";
const nomDuJob = (j) => j.nomTauro || j.nomOrigine || "";

// Date lue par l'opérateur (« déjà lancé le … », 10 premiers caractères) : jour et heure LOCAUX,
// « AAAA-MM-JJTHH:MM:SS ». Le jour stocké (inscrire) prime : c'est celui du lancement.
function dateLocale(d) {
  if (!d.date) return "";
  const [jourLocal, heure] = new Date(d.date).toLocaleString("sv-SE").split(" ");
  return `${d.jour || jourLocal}T${heure}`;
}

/** Entrées déjà lancées qui concernent la sélection (clés, commandes) ou le jour. */
async function entreesPourLancement(lignes, jour) {
  const cles = [...new Set(lignes.flatMap((l) => l.clesJournal || [l.cle]).filter(Boolean))];
  const cmds = [...new Set(cles.map(cmdDeCle).filter(Boolean))];
  const docs = await withMongoRetry(
    () => LancementTauro.find({ $or: [{ cle: { $in: cles } }, { cmd: { $in: cmds } }, { jour }] }).lean(),
    { label: "Lecture du journal Tauro", ...ATTENTE_COURTE },
  );
  return docs.map((d) => ({
    date: dateLocale(d),
    job: d.job,
    hf: d.hf,
    source: d.source || "",
    octets: d.octets ?? "",
    cle: d.cle,
    ex: d.ex ?? null,
    signature: d.signature || null,
    cmd: d.cmd || "",
  }));
}

/** Une entrée par clé du job Tauro. */
async function inscrire(jobTauro, { source = "", octets, mode } = {}) {
  const date = new Date();
  const job = nomDuJob(jobTauro);
  const m = mode || (jobTauro.horsSession ? "hors-session" : "session");
  const docs = (jobTauro.clesTauro || []).map((cle) => ({
    date,
    jour: date.toLocaleDateString("sv-SE"),
    job,
    hf: jobTauro.hfTauro,
    source,
    octets,
    cle,
    cmd: cmdDeCle(cle),
    ex: jobTauro.ex,
    signature: jobTauro.signatureTauro,
    mode: m,
    nomSansSession: regles.nomSansSession(job),
    jobId: String(jobTauro._id),
  }));
  if (docs.length) await withMongoRetry(() => LancementTauro.insertMany(docs), { label: `Journal Tauro ${job}` });
}

/** Ce job (même clé, même nom, même _id) a-t-il déjà été inscrit ? */
async function dejaInscrit(jobTauro) {
  const cle = (jobTauro.clesTauro || [])[0];
  if (!cle) return false;
  const trouve = await withMongoRetry(
    () => LancementTauro.exists({ cle, job: nomDuJob(jobTauro), jobId: String(jobTauro._id) }),
    { label: `Contrôle du journal Tauro ${nomDuJob(jobTauro)}` },
  );
  return !!trouve;
}

module.exports = { entreesPourLancement, inscrire, dejaInscrit };
