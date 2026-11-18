// Résumé du bandeau « Ajouter » : « 17 / 20 jobs sélectionnés | 9 dossiers | 6 412,30 € ».
// Ne compte que les lignes de visuel visibles (filtre sur-mesure), ni absorbées ni profils/kits.

/**
 * @param {{id:string, dossierNumero?:string, prix?:number, _absorbedBy?:string}[]} jobs lignes du Dossier API
 * @param {Set<string>} idsSelectionnes jobs cochés
 * @param {(job:object) => boolean} estVisible filtre d'affichage en cours
 * @returns {{selectionnes:number, total:number, dossiers:number, montant:number}}
 */
export function resumeSelection(jobs, idsSelectionnes, estVisible) {
  const lignes = jobs.filter((j) => j.type !== "profils_kits" && !j._absorbedBy && estVisible(j));
  const choisis = lignes.filter((j) => idsSelectionnes.has(j.id));
  return {
    selectionnes: choisis.length,
    total: lignes.length,
    dossiers: new Set(choisis.map((j) => j.dossierNumero)).size,
    montant: choisis.reduce((s, j) => s + (typeof j.prix === "number" ? j.prix : 0), 0),
  };
}
