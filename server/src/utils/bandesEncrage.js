// Bandes d'encrage dans la chute : sur un visuel clair, elles font travailler les buses foncées de la
// Tauro, sinon les repères et le nom sortent flous. Le chariot longe le grand côté de la plaque :
// une bande sur chaque petit côté est donc traversée à chaque passage. Rien sur les grands côtés : les
// buses d'un repère tirent déjà sur la bande du petit côté, dans le même passage.
// Teintes reprises des bandes posées à la main par l'atelier. Tout est en noir et CMJN, jamais en RVB.
const { cmyk } = require("pdf-lib");

const MM = 72 / 25.4;
const NOIR = cmyk(0, 0, 0, 1);
const PRESQUE_NOIR = cmyk(1, 1, 0.2, 0.7);
const BLEU = cmyk(1, 1, 0, 0.2);

const TOLERANCE = 0.5 * MM;
const MARGE_MIN_PETIT_COTE = 20 * MM;
// À partir de là, la grande bande tient derrière les repères, avec 10 mm de blanc des deux côtés.
const MARGE_GRANDE_BANDE = 86 * MM;
// Repère de 6 mm de diamètre + 12 mm de blanc.
const ECART_REPERE = 15 * MM;
const ECART_NOM = 10 * MM;
const RENFORT_MIN = 10 * MM;

// [distance au fond perdu, épaisseur, couleur], en mm. La bande continue s'arrête à 4 mm : le bord
// d'un repère est à 10 mm, il garde 6 mm de blanc.
const CONTINUE = [
  [0, 2, NOIR],
  [2, 2, PRESQUE_NOIR],
];
const GRANDE_BANDE = [
  [26, 25, PRESQUE_NOIR],
  [51, 25, BLEU],
];
const RENFORT = [5, 8, BLEU];

// Parties de [debut, fin] hors des intervalles exclus.
function intervallesLibres(debut, fin, exclus) {
  const libres = [];
  let curseur = debut;
  for (const [a, b] of [...exclus].sort((p, q) => p[0] - q[0])) {
    if (a > curseur) libres.push([curseur, Math.min(a, fin)]);
    curseur = Math.max(curseur, b);
  }
  if (curseur < fin) libres.push([curseur, fin]);
  return libres.filter(([a, b]) => b - a >= RENFORT_MIN);
}

// Coordonnées en points, petits côtés en haut et en bas de la page (avant rotation). `panneau` : emprise
// fond perdu compris. `reperes` : abscisses des repères de chaque petit côté. `nomHaut` : étendue du nom
// imprimé sur le petit côté haut. Retourne les rectangles et les petits côtés trop étroits.
function rectanglesBandes({ plaque, panneau, reperes, nomHaut }) {
  const rectangles = [];
  const ignores = [];

  const petitCote = (cote, bord, sens, marge) => {
    if (marge < MARGE_MIN_PETIT_COTE - TOLERANCE) {
      ignores.push(cote);
      return;
    }
    const ajouter = (x0, x1, [ecart, epaisseur, color]) =>
      rectangles.push({
        x: x0,
        y: sens > 0 ? bord + ecart * MM : bord - (ecart + epaisseur) * MM,
        width: x1 - x0,
        height: epaisseur * MM,
        color,
      });

    CONTINUE.forEach((bande) => ajouter(plaque.x0, plaque.x1, bande));
    if (marge >= MARGE_GRANDE_BANDE) {
      GRANDE_BANDE.forEach((bande) => ajouter(plaque.x0, plaque.x1, bande));
      return;
    }
    const exclus = reperes[cote].map((x) => [x - ECART_REPERE, x + ECART_REPERE]);
    if (cote === "haut" && nomHaut) exclus.push([nomHaut[0] - ECART_NOM, nomHaut[1] + ECART_NOM]);
    const debut = Math.min(...reperes[cote]);
    const fin = Math.max(...reperes[cote]);
    intervallesLibres(debut, fin, exclus).forEach(([a, b]) => ajouter(a, b, RENFORT));
  };

  petitCote("haut", panneau.y1, 1, plaque.y1 - panneau.y1);
  petitCote("bas", panneau.y0, -1, panneau.y0 - plaque.y0);
  return { rectangles, ignores };
}

// Dessine les bandes et retourne les petits côtés laissés sans bande.
function dessinerBandes(page, options) {
  const { rectangles, ignores } = rectanglesBandes(options);
  rectangles.forEach((r) => page.drawRectangle({ ...r, borderWidth: 0 }));
  return ignores;
}

module.exports = { dessinerBandes, rectanglesBandes, NOIR, PRESQUE_NOIR, BLEU };
