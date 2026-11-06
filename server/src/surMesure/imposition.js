// Imposition d'un sur-mesure : pour chaque page d'un PDF, un .cut i-cut et un PDF imposé sur plaque.
// Ne décide d'aucun emplacement : retourne du texte et des octets à l'appelant.
// Règles et mesures : voir le cahier des charges, section sur-mesure.
const QRCode = require("qrcode");
const { PDFDocument, StandardFonts, cmyk, degrees } = require("pdf-lib");

const MM = 72 / 25.4;
const PLAQUES = [
  [1600, 1010],
  [2150, 1010],
  [2600, 1260],
  [2600, 1510],
  [3050, 1500],
  [3050, 1510],
];
const MARGE_LONGUEUR = 25;
const MARGE_LARGEUR = 5;
const MARGE_MIN_REPERES = 40;
const DEGAGEMENT_COTES = 60;
const MARGE_OFFSET_REDUIT = 20;
const MODULE_QR = 0.8;
const DIAMETRE_REPERE = 6;
const CORPS_LIBELLE = 50;
const CORPS_LIBELLE_LATERAL = 35;
const MARGE_MIN_LIBELLE = 22;
const FOND_PERDU = 5;
const RETRAIT_LIBELLE_LATERAL = 10;
const PLUS_GRANDE_LONGUEUR = 3050;
const NOIR = cmyk(0, 0, 0, 1);

function hauteurDansNom(nom) {
  const m = nom.match(/H\s*(\d+(?:[.,]\d+)?)\s*cm/i) || nom.match(/\d+(?:[.,]\d+)?\s*x\s*(\d+(?:[.,]\d+)?)/i);
  return m ? parseFloat(m[1].replace(",", ".")) * 10 : null;
}

function decouperNom(nom) {
  const propre = nom
    .replace(/[\s_]*\(\d+\)[\s_]*/, " ")
    .replace(/^(\d+)\s*-\s*/, "$1 ")
    .trim();
  const m = propre.match(/^(.*?)[\s_]*(?<![A-Za-zÀ-ÿ])((?:\+\s*\S+\s+)?(?:MAT|BRILLANT))$/i);
  return m ? { base: m[1], finition: m[2] } : { base: propre, finition: "" };
}

// Panneaux numérotés de gauche à droite dans l'ordre des pages.
// Le numéro suit celui de la commande : le QR ne garde que le début du nom.
function nommer({ base, finition }, i, total) {
  const nom = [base, finition].filter(Boolean).join(" ");
  return total > 1 ? nom.replace(" ", `-${i + 1} `) : nom;
}

const texteQr = (nom) => `${nom.slice(0, 24)}T`;

function choisirPlaque(largeur, hauteur, forcee) {
  if (hauteur < largeur) {
    throw new Error(`Panneau ${largeur} x ${hauteur} mm : plus large que haut, non pris en charge.`);
  }
  const plaque =
    forcee || PLAQUES.find(([l, h]) => hauteur + 2 * MARGE_LONGUEUR <= l && largeur + 2 * MARGE_LARGEUR <= h);
  if (!plaque) throw new Error(`Aucune plaque connue pour ${largeur} x ${hauteur} mm : choisissez une plaque.`);
  if (hauteur > plaque[0] || largeur > plaque[1]) {
    throw new Error(`Le panneau ${largeur} x ${hauteur} mm dépasse la plaque ${plaque.join("x")}.`);
  }
  return plaque;
}

function imposer(largeur, hauteur, nom, forcee) {
  const [pl, ph] = choisirPlaque(largeur, hauteur, forcee);
  const qr = QRCode.create(texteQr(nom), { errorCorrectionLevel: "L" }).modules;
  const cote = qr.size * MODULE_QR;
  const x0 = (pl - hauteur) / 2;
  const x1 = x0 + hauteur;
  const marge = (ph - largeur) / 2;
  const y0 = marge;
  const y1 = y0 + largeur;
  const surCotes = marge < MARGE_MIN_REPERES || x0 >= DEGAGEMENT_COTES;
  const reperes = surCotes
    ? [
        [x0 - 13, y0 + 3],
        [x0 - 13, y0 + 53],
        [x0 - 13, y1 - 3],
        [x1 + 13, y0 + 3],
        [x1 + 13, y1 - 3],
      ]
    : [
        [x0 + 3, y0 - 13],
        [x0 + 53, y0 - 13],
        [x0 + 3, y1 + 13],
        [x1 - 3, y0 - 13],
        [x1 - 3, y1 + 13],
      ];
  const posQr = surCotes ? [1, 100] : [90, 5];
  const offset = surCotes ? [-(1 + cote), y0 <= MARGE_OFFSET_REDUIT ? y0 - 102.5 : -102.5] : [-(90 + cote), -7.5];
  const chutes = [
    [
      [pl, ph / 2],
      [x1 + 10, ph / 2],
    ],
    [
      [0, ph / 2],
      [x0 - 10, ph / 2],
    ],
  ];
  if (ph === 1010 && marge >= 30) {
    const [t1, t2] = [pl / 3, (2 * pl) / 3];
    chutes.push(
      [
        [t2, ph],
        [t2, y1 + 10],
      ],
      [
        [t2, y0 - 10],
        [t2, 0],
      ],
      [
        [t1, 0],
        [t1, y0 - 10],
      ],
      [
        [t1, y1 + 10],
        [t1, ph],
      ],
    );
  }
  return { nom, largeur, hauteur, plaque: [pl, ph], x0, x1, y0, y1, reperes, chutes, offset, qr, cote, posQr };
}

function nombre(v) {
  const r = Math.round(v * 1e4) / 1e4;
  return Number.isInteger(r) ? r.toFixed(1) : String(r);
}

function scriptCut(g) {
  const p = (x, y) => `${nombre(x)},${nombre(y)}`;
  const { x0, x1, y0, y1 } = g;
  return [
    "MGE i-cut script",
    "// decoGestion",
    "Clear",
    "SystemUnits mm Local",
    "OpenCuttingKeyFor Dibond 3mm",
    ...g.reperes.map(([x, y]) => `RegMark ${p(x, y)},Regmark`),
    "SelectLayer Cut",
    `MoveTo ${p(x0, y0)},Closed,Cut`,
    `LineTo ${p(x0, y1)},Corner`,
    `LineTo ${p(x1, y1)},Corner`,
    `LineTo ${p(x1, y0)},Corner`,
    `LineTo ${p(x0, y0)},Corner`,
    "SelectLayer WasteCutting",
    ...g.chutes.flatMap(([a, b]) => [`MoveTo ${p(...a)},Open,WasteCutting`, `LineTo ${p(...b)},Corner`]),
    `Offset ${nombre(g.offset[0])}, ${nombre(g.offset[1])}`,
    "",
  ].join("\n");
}

// Échelle 1 ou 10. Une page trop grande pour exister à 1/10 est forcément en taille réelle ;
// sinon l'échelle se déduit d'une hauteur connue : celle du nom, puis celle de Gamesys.
function echelleSource(hauteurTrimPt, nom, { echelle, hauteurAttendue } = {}) {
  if (echelle) return echelle;
  const reelle = hauteurTrimPt / MM;
  if (reelle * 10 > PLUS_GRANDE_LONGUEUR) return 1;
  for (const reference of [hauteurDansNom(nom), hauteurAttendue].filter(Boolean)) {
    const trouvee = [1, 10].find((e) => Math.abs((reelle * e) / reference - 1) < 0.01);
    if (trouvee) return trouvee;
  }
  throw new Error(`Hauteur de ${reelle.toFixed(1)} mm dans le PDF : échelle à préciser (${nom}).`);
}

// Dimensions finies et nom d'une page, sans choix de plaque.
function mesurerPage(doc, nomFichier, index, options = {}) {
  const pages = doc.getPages();
  const trim = pages[index].getTrimBox();
  const echelle = echelleSource(trim.height, nomFichier, options);
  const mm = (pt) => Math.round((pt * echelle * 10) / MM) / 10;
  const nom = nommer(decouperNom(nomFichier), index, pages.length);
  return { page: index, nom, largeur: mm(trim.width), hauteur: mm(trim.height), echelle, trim };
}

// `options.plaques[i]` force la plaque de la page i, `options.plaque` celle de toutes les pages.
function lirePanneau(doc, nomFichier, index, options = {}) {
  const mesure = mesurerPage(doc, nomFichier, index, options);
  const plaque = options.plaques?.[index] || options.plaque;
  return { ...imposer(mesure.largeur, mesure.hauteur, mesure.nom, plaque), ...mesure };
}

function lirePanneaux(doc, nomFichier, options = {}) {
  const panneaux = doc.getPages().map((_, i) => lirePanneau(doc, nomFichier, i, options));
  const codes = panneaux.map((p) => texteQr(p.nom));
  if (new Set(codes).size !== codes.length) throw new Error(`Deux plaques auraient le même QR : ${codes.join(" | ")}`);
  return panneaux;
}

// Sous le panneau s'il y a la place. Sinon, comme un job standard : le long du bord haut du panneau,
// soit le petit côté gauche de la plaque, centré, en lecture de bas en haut.
function positionLibelle(g, largeurTexte) {
  if (g.y0 - FOND_PERDU >= MARGE_MIN_LIBELLE) return { x: 148.2, y: 5.3, corps: CORPS_LIBELLE, rotation: 0 };
  return {
    x: g.x0 - RETRAIT_LIBELLE_LATERAL,
    y: (g.plaque[1] - largeurTexte(CORPS_LIBELLE_LATERAL)) / 2,
    corps: CORPS_LIBELLE_LATERAL,
    rotation: 90,
  };
}

const chargerSource = (octets) => PDFDocument.load(octets, { updateMetadata: false });

// `libelle` : texte imprimé sur la plaque, à ne pas confondre avec `g.nom`, qui porte le QR et le .cut.
async function pdfImpose(source, g, libelle = g.nom) {
  const doc = await PDFDocument.create();
  const [panneau] = await doc.embedPdf(source, [g.page]);
  const [pl, ph] = g.plaque;
  const page = doc.addPage([pl * MM, ph * MM]);
  // rotation de 90° : le haut du panneau part à gauche de la plaque
  page.drawPage(panneau, {
    x: g.x0 * MM + g.echelle * (g.trim.y + g.trim.height),
    y: g.y0 * MM - g.echelle * g.trim.x,
    rotate: degrees(90),
    xScale: g.echelle,
    yScale: g.echelle,
  });
  for (const [x, y] of g.reperes) {
    page.drawCircle({ x: x * MM, y: y * MM, size: (DIAMETRE_REPERE / 2) * MM, color: NOIR, borderWidth: 0 });
  }
  // QR tourné de 270° comme dans les impositions i-cut
  const [qx, qy] = g.posQr;
  const n = g.qr.size;
  for (let ligne = 0; ligne < n; ligne++) {
    for (let col = 0; col < n; col++) {
      if (!g.qr.data[ligne * n + col]) continue;
      page.drawRectangle({
        x: (qx + ligne * MODULE_QR) * MM,
        y: (qy + col * MODULE_QR) * MM,
        width: MODULE_QR * MM,
        height: MODULE_QR * MM,
        color: NOIR,
        borderWidth: 0,
      });
    }
  }
  const police = await doc.embedFont(StandardFonts.Helvetica);
  const { x, y, corps, rotation } = positionLibelle(g, (taille) => police.widthOfTextAtSize(libelle, taille) / MM);
  page.drawText(libelle, { x: x * MM, y: y * MM, size: corps, font: police, color: NOIR, rotate: degrees(rotation) });
  return doc.save({ useObjectStreams: false });
}

module.exports = {
  chargerSource,
  mesurerPage,
  lirePanneau,
  lirePanneaux,
  scriptCut,
  pdfImpose,
  positionLibelle,
  hauteurDansNom,
  decouperNom,
  nommer,
  texteQr,
  choisirPlaque,
  imposer,
};
