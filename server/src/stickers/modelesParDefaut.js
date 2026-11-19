// Modèles standard : reproduction vectorielle des anciennes notices (server/public/images/notice_*.pdf),
// positions relevées sur ces PDF et sur l'ancien createStickers (n°/ex, ligne d'infos, miniature).
const path = require("path");

const LOGOS = {
  deco: { nom: "Logo déco-K-in", fichier: "logo_deco.png", l: 24, h: 5.9 },
  casto: { nom: "Logo ID panneaux", fichier: "logo_casto.png", l: 23.6, h: 7.9 },
  brico: { nom: "Logo Muranéo", fichier: "logo_brico.png", l: 23.5, h: 8.5 },
};
const DOSSIER_LOGOS = path.join(__dirname, "../../public/images/stickers");

const ENSEIGNES = [
  { client: "LM", nom: "LM standard", couleur: "#EC2027", logo: "deco" },
  { client: "ECOM", nom: "ECOM standard", couleur: "#EC2027", logo: "deco" },
  { client: "CASTO", nom: "CASTO standard", couleur: "#A80933", logo: "casto" },
  { client: "BRICO", nom: "BRICO standard", couleur: "#E30613", logo: "brico" },
];

function elementsStandard(couleur, logo, imageId) {
  const texte = (id, contenu, y, h, taille, extra = {}) => ({
    id,
    type: "texte",
    x: 5,
    y,
    l: 95,
    h,
    rotation: 0,
    contenu,
    police: "bold",
    taille,
    couleur,
    align: "center",
    interligne: 1.15,
    ajuster: true,
    ...extra,
  });
  return [
    { id: "bandes_haut", type: "forme", forme: "bandes", x: 1.3, y: 1.2, l: 102.4, h: 1.7, rotation: 0, couleur, periode: 2.62, largeurBande: 1.3 },
    texte("haut", "HAUT", 4, 8, 24),
    { id: "fleche_haut", type: "picto", cle: "fleche_haut", x: 49.5, y: 13.2, l: 6, h: 8, rotation: 0, couleur },
    texte("pret", "LE PANNEAU EST PRÊT\nÀ ÊTRE POSÉ", 24.4, 12, 12.5, { interligne: 1.28 }),
    texte("numEx", "{numEx}", 36.2, 6.5, 16, { couleur: "#000000" }),
    texte("infos", "{infos}", 44.6, 4.5, 10, { couleur: "#000000", police: "regular" }),
    { id: "miniature", type: "miniature", x: 5, y: 49.5, l: 95, h: 31.5, rotation: 0, orientationImage: -90 },
    {
      id: "logo",
      type: "image",
      imageId,
      x: 52.5 - LOGOS[logo].l / 2,
      y: 81.6,
      l: LOGOS[logo].l,
      h: LOGOS[logo].h,
      rotation: 0,
    },
    { id: "attention", type: "picto", cle: "attention", x: 43, y: 94, l: 19, h: 16.7, rotation: 0, couleur },
    texte("attention_titre", "ATTENTION :", 111.5, 4, 10),
    texte(
      "attention_texte",
      "Vérifiez le sens (haut et bas) de votre\nou de vos panneaux afin de contrôler\nles éventuels raccords avant la pose.",
      115.4,
      12,
      9,
      { police: "regular", interligne: 1.2 },
    ),
    { id: "fleche_bas", type: "picto", cle: "fleche_bas", x: 49.5, y: 128.2, l: 6, h: 8, rotation: 0, couleur },
    texte("bas", "BAS", 138.3, 7, 24),
    { id: "bandes_bas", type: "forme", forme: "bandes", x: 1.3, y: 145.1, l: 102.4, h: 1.7, rotation: 0, couleur, periode: 2.62, largeurBande: 1.3 },
  ];
}

module.exports = { ENSEIGNES, LOGOS, DOSSIER_LOGOS, elementsStandard };
