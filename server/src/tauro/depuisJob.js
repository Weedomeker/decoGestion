/*
  Adaptateur job decoGestion -> ligne Tauro (voir lancement-tauro.js).
  Complète depuisDecoGestion : nom d'origine, job sans PDF, clés du journal, crédences et sur-mesure.
*/
"use strict";
const { depuisDecoGestion, decorDepuisFichier, finitionDe } = require("./lancement-tauro");
const { nomsJob } = require("../utils/nomsJob");

const REGEX_CREDENCE = /^\d{3}x\d{2}$/i;

/**
 * Décor d'une crédence pour le nom Tauro : retire « CRED », le format (« 300x60cm », « 255x60 »),
 * l'EAN CASTO (13 chiffres), la référence BRICO (« VELTIS-25560 ») et la finition.
 * « CRED 300x60cm MOSAIQUE 3664711694254 MAT.pdf » -> « MOSAIQUE » ;
 * « VELTIS BRILLANT 255x60 VELTIS-25560.pdf » -> « VELTIS ».
 */
function decorCredence(fichier) {
  return String(fichier || "")
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .split(/\s+/)
    .filter(
      (m) =>
        m &&
        !/^CRED$/i.test(m) &&
        !/^\d+x\d+(cm)?$/i.test(m) &&
        !/^\d{8,}$/.test(m) &&
        !/^[A-Z]+-\d+$/i.test(m) &&
        !/^(MAT|BRILLANT)$/i.test(m),
    )
    .join(" ");
}

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
    l.deco =
      job.visuel2 && job.visuel2 !== job.visuel
        ? `${decorCredence(job.visuel)} ET ${decorCredence(job.visuel2)}`
        : decorCredence(job.visuel);
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
