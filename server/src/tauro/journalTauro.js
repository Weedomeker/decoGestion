/*
  Journal des lancements Tauro dans MongoDB (collection LancementTauro).
  Remplace le fichier CSV de la version d'origine ; le format des entrées est celui de lireJournal.
*/
"use strict";
const LancementTauro = require("../models/LancementTauro");
const regles = require("./regles-tauro");

const cmdDeCle = (cle) => (/^(\d+)\//.exec(String(cle || "")) || [])[1] || "";
const nomDuJob = (j) => j.nomTauro || j.nomOrigine || "";

/** Entrées déjà lancées qui concernent la sélection (clés, commandes) ou le jour. */
async function entreesPourLancement(lignes, jour) {
  const cles = [...new Set(lignes.flatMap((l) => l.clesJournal || [l.cle]).filter(Boolean))];
  const cmds = [...new Set(cles.map(cmdDeCle).filter(Boolean))];
  const docs = await LancementTauro.find({ $or: [{ cle: { $in: cles } }, { cmd: { $in: cmds } }, { jour }] }).lean();
  return docs.map((d) => ({
    date: d.date ? new Date(d.date).toISOString() : "",
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
  if (docs.length) await LancementTauro.insertMany(docs);
}

/** Ce job (même clé, même nom, même _id) a-t-il déjà été inscrit ? */
async function dejaInscrit(jobTauro) {
  const cle = (jobTauro.clesTauro || [])[0];
  if (!cle) return false;
  return !!(await LancementTauro.exists({ cle, job: nomDuJob(jobTauro), jobId: String(jobTauro._id) }));
}

module.exports = { entreesPourLancement, inscrire, dejaInscrit };
