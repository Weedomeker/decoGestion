/*
  Adaptateur job decoGestion -> ligne Tauro (voir lancement-tauro.js).
  Complète depuisDecoGestion : nom d'origine, job sans PDF, clés du journal, crédences et sur-mesure.
*/
"use strict";
const { depuisDecoGestion, decorDepuisFichier, finitionDe } = require("./lancement-tauro");
const { nomsJob } = require("../utils/nomsJob");

const REGEX_CREDENCE = /^\d{3}x\d{2}$/i;

function ligneDepuisJob(job) {
  const l = depuisDecoGestion(job);
  const cmd = String(job.cmd ?? "");
  const sd = String(job.sousDossier ?? "").trim();
  const sansId = !sd || !cmd || Number(job.cmd) === 0;

  let pdfBaseName = "";
  try {
    pdfBaseName = nomsJob(job).pdfBaseName;
  } catch {
    // job incomplet (ville, format absents) : pas de nom d'origine
  }
  l.nomOrigine = pdfBaseName.replace(/\.pdf$/i, "");
  l.sansPdf = !!job.teinteMasse || !!job.useStock;

  let cle = sansId ? `id:${job._id}` : `${cmd}/${sd}`;
  const cles = [];

  if (job.smBase) {
    const apres = String(job.smBase).split(" - ").pop();
    l.deco = decorDepuisFichier(apres);
    l.fmtVis = String(job.smFormat || "");
    l.finition = finitionDe(job.smBase);
    if (!sansId) cle = `${cmd}/${sd}-p${job.smPage}`;
  } else if (REGEX_CREDENCE.test(job.format_visu)) {
    if (job.visuel2 && job.visuel2 !== job.visuel) {
      l.deco = `${decorDepuisFichier(job.visuel)} ET ${decorDepuisFichier(job.visuel2)}`;
    }
    const cmd2 = job.cmd2;
    if (cmd2 && String(cmd2) !== cmd) {
      l.cmd = `${cmd}+${cmd2}`;
      const sd2 = String(job.sousDossier2 ?? "").trim();
      if (sd2) cles.push(`${cmd2}/${sd2}`);
    }
  }

  if (Array.isArray(job.sousDossiers) && job.sousDossiers.length > 1 && !sansId) {
    cles.push(...job.sousDossiers.map((s) => `${cmd}/${s}`));
  }

  l.cle = cle;
  l.clesJournal = [...new Set([cle, ...cles])];
  return l;
}

module.exports = { ligneDepuisJob };
