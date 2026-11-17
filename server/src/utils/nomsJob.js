const { castoName } = require("./jobNames");

/**
 * Noms decoGestion d'un job (texte imprimé sur la plaque, nom du JPG, nom du PDF de sortie).
 * Extraction à l'identique de processJob : ne rien changer ici sans changer le comportement de sortie.
 * pdfBaseName vaut "" pour une teinte masse ou un job pris en stock (aucun PDF produit).
 */
function nomsJob(job) {
  const isCredences = /^\d{3}x\d{2}$/i.test(job.format_visu);

  const fileName = job.smBase
    ? `${job.smBase} ${job.ex}_EX`
    : `${job.cmd} - ${job.client} ${job.ville.toUpperCase()} - ${
        job.teinteMasse ? job.format_visu.split("_").pop() : job.format_Plaque.split("_").pop()
      } - ${job.visuel.replace(/\.[^/.]+$/, "")} ${job.ex}_EX`;

  const fileName2 = isCredences
    ? `${job.cmd2 === 0 ? "" : `${job.cmd2} - `}${job.client} ${job.ville.toUpperCase()} - ${
        job.teinteMasse ? job.format2_visu.split("_").pop() : job.format_Plaque.split("_").pop()
      } - ${job.visuel2.replace(/\.[^/.]+$/, "")} ${job.ex}_EX` || ""
    : "";

  let pdfBaseName = "";
  if (!job.teinteMasse && !job?.useStock) {
    pdfBaseName = isCredences
      ? `${castoName(fileName)}${job.visuPath2 ? ` + ${castoName(fileName2)}` : ""}.pdf`
      : `${fileName}.pdf`;
  }

  return { fileName, fileName2, pdfBaseName };
}

/**
 * Préfixe des JPG d'un job de session Tauro (« S1711A-011 ») : les JPG du dossier du jour se
 * trient dans l'ordre d'impression. Vide pour les autres jobs (hors session, classiques).
 */
function prefixeJpg(job) {
  if (!job.sessionTauro) return "";
  return `${job.sessionTauro}-${String(job.ordreTauro ?? 0).padStart(3, "0")} `;
}

module.exports = { nomsJob, prefixeJpg };
