// Dessine une étiquette A6 à partir d'un modèle (liste d'éléments positionnés en mm).
// L'éditeur (client/src/components/sticker) applique les mêmes règles en SVG : garder les deux alignés
// (ligne de base des textes, réduction des textes trop longs, ajustement des images, bandes).
const fs = require("fs");
const {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  LineCapStyle,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
} = require("pdf-lib");
const { PICTOS_PAR_CLE } = require("./pictos");
const { remplacerJetons } = require("./donneesEtiquette");

const MM = 72 / 25.4;
const PAGE = { l: 105, h: 148 }; // A6, comme l'ancien PDF notice (createStickersPage en place 4 par A4)
const ASCENDANT = 0.718; // Helvetica et Helvetica-Bold : ligne de base = haut de ligne + 0,718 × taille
const TYPES = ["texte", "picto", "image", "miniature", "forme"];
const FORMES = ["rect", "ligne", "bandes"];
const MAX_ELEMENTS = 80;

const num = (v, def, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
};
const couleurValide = (c, def) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c.toUpperCase() : def);
const chaine = (s, max) => (typeof s === "string" ? s.slice(0, max) : "");

// Nettoie des éléments venus du client : types connus, nombres bornés, chaînes tronquées.
function normaliserElements(elements) {
  if (!Array.isArray(elements)) return [];
  return elements
    .filter((e) => e && TYPES.includes(e.type))
    .slice(0, MAX_ELEMENTS)
    .map((e, i) => {
      const base = {
        id: chaine(e.id, 40) || `e${i}`,
        type: e.type,
        x: num(e.x, 0, -PAGE.l, PAGE.l * 2),
        y: num(e.y, 0, -PAGE.h, PAGE.h * 2),
        l: num(e.l, 10, 0.5, PAGE.l * 2),
        h: num(e.h, 10, 0.5, PAGE.h * 2),
        rotation: num(e.rotation, 0, -360, 360),
        verrou: Boolean(e.verrou),
      };
      switch (e.type) {
        case "texte":
          return {
            ...base,
            contenu: chaine(e.contenu, 500),
            police: e.police === "regular" ? "regular" : "bold",
            taille: num(e.taille, 12, 3, 120),
            couleur: couleurValide(e.couleur, "#000000"),
            align: ["left", "center", "right"].includes(e.align) ? e.align : "center",
            interligne: num(e.interligne, 1.15, 0.8, 3),
            ajuster: e.ajuster !== false,
          };
        case "picto":
          return { ...base, cle: chaine(e.cle, 40), couleur: couleurValide(e.couleur, "#000000") };
        case "image":
          return { ...base, imageId: chaine(e.imageId, 40) };
        case "miniature":
          return { ...base, orientationImage: [0, 90, -90].includes(Number(e.orientationImage)) ? Number(e.orientationImage) : -90 };
        case "forme":
          return {
            ...base,
            forme: FORMES.includes(e.forme) ? e.forme : "rect",
            couleur: couleurValide(e.couleur, "#000000"),
            fond: e.fond === "" || e.fond == null ? "" : couleurValide(e.fond, ""),
            epaisseur: num(e.epaisseur, 0.5, 0, 20),
            periode: num(e.periode, 2.6, 0.5, 50),
            largeurBande: num(e.largeurBande, 1.3, 0.1, 50),
          };
        default:
          return base;
      }
    });
}

function hexRgb(hex) {
  const h = couleurValide(hex, "#000000");
  return rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
}

// Les polices standard ne couvrent que WinAnsi : un caractère hors jeu ferait échouer tout le PDF.
function texteImprimable(font, texte) {
  try {
    font.encodeText(texte);
    return texte;
  } catch {
    return [...texte]
      .filter((c) => {
        try {
          font.encodeText(c);
          return true;
        } catch {
          return false;
        }
      })
      .join("");
  }
}

// Taille réduite pour que la ligne la plus longue tienne dans la largeur (même règle côté éditeur).
function tailleAjustee(lignes, mesurer, taille, largeurPt) {
  const plusLarge = Math.max(0, ...lignes.map((l) => mesurer(l, taille)));
  if (plusLarge <= largeurPt || plusLarge === 0) return taille;
  return Math.max(3, Math.floor(((taille * largeurPt) / plusLarge) * 10) / 10);
}

// Sutherland-Hodgman : polygone convexe découpé par le rectangle (x0, y0, x1, y1).
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

// Bandes de signalisation inclinées « / », découpées au cadre. Partagé avec l'éditeur (même calcul).
function cheminBandes(e) {
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

function typeImage(buffer) {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg";
  return null;
}

// Place une image dans le cadre en gardant ses proportions, tournée de 0 / 90 / -90 degrés.
function dessinerImageAjustee(page, img, e, pageH, orientation = 0) {
  const tourne = orientation === 90 || orientation === -90;
  const largeurVue = tourne ? img.height : img.width;
  const hauteurVue = tourne ? img.width : img.height;
  const s = Math.min((e.l * MM) / largeurVue, (e.h * MM) / hauteurVue);
  const dw = img.width * s;
  const dh = img.height * s;
  const vueL = largeurVue * s;
  const vueH = hauteurVue * s;
  const gauche = e.x * MM + (e.l * MM - vueL) / 2;
  const haut = pageH - e.y * MM - (e.h * MM - vueH) / 2;
  const bas = haut - vueH;
  if (orientation === -90) {
    page.drawImage(img, { x: gauche, y: haut, width: dw, height: dh, rotate: degrees(-90) });
  } else if (orientation === 90) {
    page.drawImage(img, { x: gauche + vueL, y: bas, width: dw, height: dh, rotate: degrees(90) });
  } else {
    page.drawImage(img, { x: gauche, y: bas, width: dw, height: dh });
  }
}

/**
 * @param {Array} elements éléments du modèle (normalisés ou non)
 * @param {object} donnees jetons (donneesEtiquette)
 * @param {object} [opts] { chargerImage(imageId) → Promise<{data: Buffer}|null> }
 * @returns {Promise<Uint8Array>}
 */
async function renderSticker(elements, donnees = {}, opts = {}) {
  const pdfDoc = await PDFDocument.create();
  const pageW = PAGE.l * MM;
  const pageH = PAGE.h * MM;
  const page = pdfDoc.addPage([pageW, pageH]);
  const polices = {
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
  };
  const imagesIntegrees = new Map();

  const integrer = async (cle, charger) => {
    if (imagesIntegrees.has(cle)) return imagesIntegrees.get(cle);
    let img = null;
    try {
      const data = await charger();
      const type = data && typeImage(data);
      if (type === "png") img = await pdfDoc.embedPng(data);
      else if (type === "jpg") img = await pdfDoc.embedJpg(data);
    } catch {
      img = null; // image illisible ou absente : l'étiquette sort sans elle
    }
    imagesIntegrees.set(cle, img);
    return img;
  };

  for (const e of normaliserElements(elements)) {
    const tourne = e.rotation % 360 !== 0;
    if (tourne) {
      // Rotation autour du centre du cadre ; l'éditeur tourne dans le sens horaire (SVG), le PDF dans l'autre.
      const cx = (e.x + e.l / 2) * MM;
      const cy = pageH - (e.y + e.h / 2) * MM;
      const t = (-e.rotation * Math.PI) / 180;
      const cos = Math.cos(t);
      const sin = Math.sin(t);
      page.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy),
      );
    }

    if (e.type === "texte") {
      const font = polices[e.police];
      const lignes = remplacerJetons(e.contenu, donnees)
        .split("\n")
        .map((l) => texteImprimable(font, l));
      const mesurer = (l, t) => font.widthOfTextAtSize(l, t);
      const taille = e.ajuster ? tailleAjustee(lignes, mesurer, e.taille, e.l * MM) : e.taille;
      lignes.forEach((ligne, i) => {
        if (!ligne) return;
        const largeur = mesurer(ligne, taille);
        const gauche = e.x * MM;
        const x =
          e.align === "center" ? gauche + (e.l * MM - largeur) / 2 : e.align === "right" ? gauche + e.l * MM - largeur : gauche;
        const ligneDeBase = e.y * MM + i * taille * e.interligne + taille * ASCENDANT;
        page.drawText(ligne, { x, y: pageH - ligneDeBase, size: taille, font, color: hexRgb(e.couleur) });
      });
    } else if (e.type === "picto") {
      const picto = PICTOS_PAR_CLE.get(e.cle);
      if (picto) {
        const [vw, vh] = picto.viewBox;
        const s = Math.min(e.l / vw, e.h / vh);
        const gauche = e.x + (e.l - vw * s) / 2;
        const haut = e.y + (e.h - vh * s) / 2;
        for (const c of picto.couches) {
          const couleur = (v) => hexRgb(v === "couleur" ? e.couleur : v);
          page.drawSvgPath(c.d, {
            x: gauche * MM,
            y: pageH - haut * MM,
            scale: s * MM,
            ...(c.fill ? { color: couleur(c.fill) } : {}),
            ...(c.stroke
              ? { borderColor: couleur(c.stroke), borderWidth: c.largeur || 1, borderLineCap: LineCapStyle.Round }
              : {}),
          });
        }
      }
    } else if (e.type === "image") {
      if (e.imageId && opts.chargerImage) {
        const img = await integrer(`img:${e.imageId}`, async () => (await opts.chargerImage(e.imageId))?.data);
        if (img) dessinerImageAjustee(page, img, e, pageH, 0);
      }
    } else if (e.type === "miniature") {
      // Fichier importé pour cette étiquette (miniatureData), sinon aperçu sur disque.
      if (donnees.miniatureData) {
        const img = await integrer("mini:data", () => Promise.resolve(donnees.miniatureData));
        if (img) dessinerImageAjustee(page, img, e, pageH, e.orientationImage);
      } else if (donnees.miniaturePath) {
        const img = await integrer(`mini:${donnees.miniaturePath}`, () => fs.promises.readFile(donnees.miniaturePath));
        if (img) dessinerImageAjustee(page, img, e, pageH, e.orientationImage);
      }
    } else if (e.type === "forme") {
      // Sans fond ni bordure, pdf-lib tracerait un contour noir : rien à dessiner.
      if (e.forme === "rect" && (e.fond || e.epaisseur > 0)) {
        page.drawRectangle({
          x: e.x * MM,
          y: pageH - (e.y + e.h) * MM,
          width: e.l * MM,
          height: e.h * MM,
          ...(e.fond ? { color: hexRgb(e.fond) } : {}),
          ...(e.epaisseur > 0 ? { borderColor: hexRgb(e.couleur), borderWidth: e.epaisseur * MM } : {}),
        });
      } else if (e.forme === "ligne") {
        const y = pageH - (e.y + e.h / 2) * MM;
        page.drawLine({
          start: { x: e.x * MM, y },
          end: { x: (e.x + e.l) * MM, y },
          thickness: Math.max(e.epaisseur, 0.05) * MM,
          color: hexRgb(e.couleur),
        });
      } else if (e.forme === "bandes") {
        const d = cheminBandes(e);
        if (d) page.drawSvgPath(d, { x: 0, y: pageH, scale: MM, color: hexRgb(e.couleur) });
      }
    }

    if (tourne) page.pushOperators(popGraphicsState());
  }

  return pdfDoc.save();
}

module.exports = { renderSticker, normaliserElements, cheminBandes, tailleAjustee, PAGE, MM, ASCENDANT };
