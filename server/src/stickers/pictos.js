// Bibliothèque de pictos des étiquettes, en chemins SVG : le serveur les dessine dans le PDF
// (pdf-lib drawSvgPath) et l'éditeur les affiche tels quels (GET /sticker_pictos).
// Couche : { d, fill?, stroke?, largeur? } ; "couleur" = couleur choisie sur l'élément, sinon couleur fixe.

const PICTOS = [
  {
    cle: "fleche_haut",
    nom: "Flèche haut",
    categorie: "Sens de pose",
    viewBox: [60, 80],
    couches: [{ d: "M30 0 L60 34 L41 34 L41 80 L19 80 L19 34 L0 34 Z", fill: "couleur" }],
  },
  {
    cle: "fleche_bas",
    nom: "Flèche bas",
    categorie: "Sens de pose",
    viewBox: [60, 80],
    couches: [{ d: "M30 80 L60 46 L41 46 L41 0 L19 0 L19 46 L0 46 Z", fill: "couleur" }],
  },
  {
    cle: "fleche_gauche",
    nom: "Flèche gauche",
    categorie: "Sens de pose",
    viewBox: [80, 60],
    couches: [{ d: "M0 30 L34 0 L34 19 L80 19 L80 41 L34 41 L34 60 Z", fill: "couleur" }],
  },
  {
    cle: "fleche_droite",
    nom: "Flèche droite",
    categorie: "Sens de pose",
    viewBox: [80, 60],
    couches: [{ d: "M80 30 L46 0 L46 19 L0 19 L0 41 L46 41 L46 60 Z", fill: "couleur" }],
  },
  {
    cle: "attention",
    nom: "Attention",
    categorie: "Sens de pose",
    viewBox: [100, 88],
    couches: [
      { d: "M50 0 L100 88 L0 88 Z", fill: "couleur" },
      { d: "M43 26 L57 26 L54 62 L46 62 Z", fill: "#FFFFFF" },
      { d: "M43 73 A7 7 0 1 0 57 73 A7 7 0 1 0 43 73 Z", fill: "#FFFFFF" },
    ],
  },
  {
    cle: "haut_iso",
    nom: "Haut (ISO)",
    categorie: "Manutention",
    viewBox: [100, 100],
    couches: [
      { d: "M30 4 L48 34 L37 34 L37 84 L23 84 L23 34 L12 34 Z", fill: "couleur" },
      { d: "M70 4 L88 34 L77 34 L77 84 L63 84 L63 34 L52 34 Z", fill: "couleur" },
      { d: "M8 94 L92 94", stroke: "couleur", largeur: 7 },
    ],
  },
  {
    cle: "fragile",
    nom: "Fragile",
    categorie: "Manutention",
    viewBox: [60, 100],
    couches: [
      {
        d: "M8 4 L52 4 L50 30 C48 44 40 50 33 51 L33 80 L46 86 L46 94 L14 94 L14 86 L27 80 L27 51 C20 50 12 44 10 30 Z",
        fill: "couleur",
      },
      { d: "M31 4 L23 17 L34 24 L26 38", stroke: "#FFFFFF", largeur: 3.5 },
    ],
  },
  {
    cle: "ne_pas_gerber",
    nom: "Ne pas gerber",
    categorie: "Manutention",
    viewBox: [100, 100],
    couches: [
      { d: "M24 56 L76 56 L76 95 L24 95 Z", stroke: "couleur", largeur: 7 },
      { d: "M32 8 L68 8 L68 40 L32 40 Z", stroke: "couleur", largeur: 7 },
      { d: "M14 4 L86 46 M86 4 L14 46", stroke: "couleur", largeur: 7 },
    ],
  },
  {
    cle: "humidite",
    nom: "Craint l'humidité",
    categorie: "Manutention",
    viewBox: [100, 100],
    couches: [
      { d: "M8 54 A42 40 0 0 1 92 54 Z", fill: "couleur" },
      { d: "M50 54 L50 84 A9 9 0 0 1 32 84", stroke: "couleur", largeur: 7 },
      { d: "M22 4 L17 16 M42 0 L37 12 M62 0 L57 12 M82 4 L77 16", stroke: "couleur", largeur: 5 },
    ],
  },
  {
    cle: "info",
    nom: "Information",
    categorie: "Manutention",
    viewBox: [100, 100],
    couches: [
      { d: "M0 50 A50 50 0 1 0 100 50 A50 50 0 1 0 0 50 Z", fill: "couleur" },
      { d: "M42 18 A8 8 0 1 0 58 18 A8 8 0 1 0 42 18 Z", fill: "#FFFFFF" },
      { d: "M43 36 L57 36 L57 84 L43 84 Z", fill: "#FFFFFF" },
    ],
  },
  {
    cle: "interdit",
    nom: "Interdit",
    categorie: "Manutention",
    viewBox: [100, 100],
    couches: [
      { d: "M6 50 A44 44 0 1 0 94 50 A44 44 0 1 0 6 50 Z", stroke: "couleur", largeur: 10 },
      { d: "M19 19 L81 81", stroke: "couleur", largeur: 10 },
    ],
  },
  {
    cle: "valide",
    nom: "Validé",
    categorie: "Manutention",
    viewBox: [100, 100],
    couches: [
      { d: "M0 50 A50 50 0 1 0 100 50 A50 50 0 1 0 0 50 Z", fill: "couleur" },
      { d: "M26 52 L43 69 L76 33", stroke: "#FFFFFF", largeur: 10 },
    ],
  },
];

const PICTOS_PAR_CLE = new Map(PICTOS.map((p) => [p.cle, p]));

module.exports = { PICTOS, PICTOS_PAR_CLE };
