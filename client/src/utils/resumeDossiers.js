// Résumé de la zone de recherche du Dossier API : « 12 dossiers chargés | 20 jobs | 8 182,85 € ».
// Les profils/kits et les 2es panneaux absorbés ne comptent pas : même décompte que le bandeau « Ajouter ».

/**
 * @param {{numero:string, jobs:{type?:string}[], prixTotal?:number}[]} dossiers dossiers chargés
 * @returns {{nbDossiers:number, nbJobs:number, montant:number}}
 */
export function resumeDossiers(dossiers) {
  return {
    nbDossiers: dossiers.length,
    nbJobs: dossiers.reduce((n, d) => n + d.jobs.filter((j) => j.type !== "profils_kits" && !j._absorbedBy).length, 0),
    montant: dossiers.reduce((s, d) => s + (typeof d.prixTotal === "number" ? d.prixTotal : 0), 0),
  };
}
