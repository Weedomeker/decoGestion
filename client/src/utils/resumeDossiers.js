// Résumé de la zone de recherche du Dossier API : « 12 dossiers chargés | 20 jobs | 8 182,85 € ».
// Les profils/kits ne comptent pas comme des jobs : seules les lignes de visuel en sont.

/**
 * @param {{numero:string, jobs:{type?:string}[], prixTotal?:number}[]} dossiers dossiers chargés
 * @returns {{nbDossiers:number, nbJobs:number, montant:number}}
 */
export function resumeDossiers(dossiers) {
  return {
    nbDossiers: dossiers.length,
    nbJobs: dossiers.reduce((n, d) => n + d.jobs.filter((j) => j.type !== "profils_kits").length, 0),
    montant: dossiers.reduce((s, d) => s + (typeof d.prixTotal === "number" ? d.prixTotal : 0), 0),
  };
}
