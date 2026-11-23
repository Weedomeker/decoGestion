// Vernis d'un panneau sur-mesure (« MAT », « BRILLANT » : nom du PDF puis endv_ref_client) écrit
// dans Deco.finition avec la casse des fiches existantes. Sans vernis connu, undefined : la fiche
// garde la finition qu'elle a déjà.
function finitionDuVernis(vernis) {
  const v = String(vernis || "").toUpperCase();
  if (v === "MAT") return "Mat";
  if (v === "BRILLANT") return "Brillant";
  return undefined;
}

module.exports = { finitionDuVernis };
