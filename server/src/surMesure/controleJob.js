const { plaqueMm } = require("./apparierPanneaux");
const { texteQr } = require("./imposition");

// Refus d'un panneau sur-mesure à l'ajout en file, ou null s'il peut partir.
// L'écart de plaque n'est pas repris tel quel : l'opérateur a pu changer de plaque depuis.
function refusJobSurMesure({ panneau, formatTauro, decoupeSM, jobs }) {
  if (!decoupeSM) {
    return {
      code: "SM_DECOUPE_NON_CONFIGUREE",
      error: "Dossier de découpe sur-mesure non configuré : renseignez decoupeSM dans la configuration.",
    };
  }

  const ecarts = (panneau.ecarts || []).filter((e) => e.type !== "plaque");
  const bloquant = ecarts.find((e) => e.bloquant);
  if (bloquant) return { code: "SM_BLOQUE", error: bloquant.message };
  if (ecarts.length && !panneau.ecartsConfirmes) {
    return { code: "SM_ECART_NON_CONFIRME", error: `Écart à confirmer : ${ecarts[0].message}` };
  }

  const plaque = plaqueMm(formatTauro);
  if (!plaque || panneau.hauteur > plaque[0] || panneau.largeur > plaque[1]) {
    return {
      code: "SM_PLAQUE_TROP_PETITE",
      error: `Le panneau ${panneau.largeur / 10} x ${panneau.hauteur / 10} cm n'entre pas sur la plaque ${formatTauro}.`,
    };
  }

  const memeQr = jobs.find((j) => j.smNom && j.smNom !== panneau.nom && texteQr(j.smNom) === texteQr(panneau.nom));
  if (memeQr) {
    return {
      code: "SM_QR_DOUBLON",
      error: `« ${panneau.nom} » et « ${memeQr.smNom} » auraient le même QR : la table ne les distinguerait pas.`,
    };
  }
  return null;
}

module.exports = { refusJobSurMesure };
