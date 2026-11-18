// Placement d'un menu déroulant en position fixe, par-dessus toute la page.
// Le menu n'est plus rogné par un tableau ou un panneau qui défile : il se cale
// sur la fenêtre, s'ouvre vers le haut si la place manque, et ne sort jamais de l'écran.

/**
 * @param {object} p
 * @param {{top:number,bottom:number,left:number,right:number,width:number}} p.declencheur rectangle du menu fermé
 * @param {{largeur:number,hauteur:number}} p.fenetre taille de la fenêtre
 * @param {number} p.hauteurContenu hauteur naturelle de la liste
 * @returns {{versLeHaut:boolean,top:number,left:number,minLargeur:number,maxLargeur:number,hauteurMax:number}}
 */
export function placerMenu({ declencheur, fenetre, hauteurContenu, marge = 8, hauteurMin = 120, hauteurMax = 300, largeurLisible = 480 }) {
  const utile = Math.min(hauteurContenu, hauteurMax);
  const dessous = fenetre.hauteur - declencheur.bottom - marge;
  const dessus = declencheur.top - marge;
  const versLeHaut = dessous < utile && dessus > dessous;
  const hauteur = Math.max(hauteurMin, Math.min(utile, versLeHaut ? dessus : dessous));

  const minLargeur = Math.min(declencheur.width, fenetre.largeur - 16);
  const left = Math.min(Math.max(declencheur.left, 8), fenetre.largeur - 8 - minLargeur);

  return {
    versLeHaut,
    top: versLeHaut ? declencheur.top - hauteur : declencheur.bottom,
    left,
    minLargeur,
    // libellés longs : ni débordement à droite, ni menu étiré sur toute la largeur
    maxLargeur: Math.min(fenetre.largeur - 8 - left, Math.max(minLargeur, largeurLisible)),
    hauteurMax: hauteur,
  };
}
