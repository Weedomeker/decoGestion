// Règles de rendu partagées avec server/src/stickers/renderSticker.js : garder les deux versions alignées
// (ligne de base, réduction des textes trop longs, bandes), sinon l'éditeur ne montre plus le PDF.

export const PAGE = { l: 105, h: 148 }; // A6 en mm
export const PT = 25.4 / 72; // 1 pt en mm
export const ASCENDANT = 0.718;

export function remplacerJetons(texte, donnees) {
  return String(texte ?? "").replace(/\{(\w+)\}/g, (tout, cle) =>
    donnees && typeof donnees[cle] === "string" ? donnees[cle] : tout,
  );
}

// Arial a les mêmes chasses que Helvetica (polices du PDF) : la mesure au canvas suffit.
let ctx = null;
export function mesurerTexte(texte, taille, police) {
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  ctx.font = `${police === "regular" ? 400 : 700} 100px Helvetica, Arial, sans-serif`;
  return (ctx.measureText(texte).width / 100) * taille; // en pt
}

export function tailleAjustee(lignes, mesurer, taille, largeurPt) {
  const plusLarge = Math.max(0, ...lignes.map((l) => mesurer(l, taille)));
  if (plusLarge <= largeurPt || plusLarge === 0) return taille;
  return Math.max(3, Math.floor(((taille * largeurPt) / plusLarge) * 10) / 10);
}

function decouper(points, x0, y0, x1, y1) {
  const bords = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  let sortie = points;
  for (const [dedans, intersection] of bords) {
    const entree = sortie;
    sortie = [];
    entree.forEach((cur, i) => {
      const prev = entree[(i + entree.length - 1) % entree.length];
      if (dedans(cur)) {
        if (!dedans(prev)) sortie.push(intersection(prev, cur));
        sortie.push(cur);
      } else if (dedans(prev)) {
        sortie.push(intersection(prev, cur));
      }
    });
    if (sortie.length === 0) break;
  }
  return sortie;
}

export function cheminBandes(e) {
  const { x, y, l, h } = e;
  const periode = e.periode || 2.6;
  const largeur = Math.min(e.largeurBande || 1.3, periode);
  const parts = [];
  for (let bx = x - h; bx < x + l; bx += periode) {
    const poly = decouper(
      [
        [bx + h, y],
        [bx + h + largeur, y],
        [bx + largeur, y + h],
        [bx, y + h],
      ],
      x,
      y,
      x + l,
      y + h,
    );
    if (poly.length >= 3) parts.push(`M${poly.map((p) => `${p[0].toFixed(3)} ${p[1].toFixed(3)}`).join(" L")} Z`);
  }
  return parts.join(" ");
}

let compteur = 0;
export const nouvelId = () => `e${Date.now().toString(36)}${(compteur++).toString(36)}`;

// Éléments ajoutés depuis la barre d'outils, centrés sur la page.
export function elementParDefaut(type, extra = {}) {
  const centre = (l, h) => ({ x: (PAGE.l - l) / 2, y: (PAGE.h - h) / 2, l, h, rotation: 0 });
  const base = { id: nouvelId(), type };
  switch (type) {
    case "texte":
      return {
        ...base,
        ...centre(60, 8),
        contenu: "Texte",
        police: "bold",
        taille: 14,
        couleur: "#000000",
        align: "center",
        interligne: 1.15,
        ajuster: true,
        ...extra,
      };
    case "picto":
      return { ...base, ...centre(16, 16), cle: "attention", couleur: "#E30613", ...extra };
    case "image":
      return { ...base, ...centre(30, 15), imageId: "", ...extra };
    case "miniature":
      return { ...base, ...centre(95, 31.5), orientationImage: -90, ...extra };
    case "forme":
      return {
        ...base,
        ...centre(extra.forme === "bandes" ? 102 : 40, extra.forme === "rect" ? 20 : extra.forme === "bandes" ? 1.7 : 2),
        forme: "rect",
        couleur: "#000000",
        fond: "",
        epaisseur: 0.5,
        periode: 2.62,
        largeurBande: 1.3,
        ...extra,
      };
    default:
      return base;
  }
}
