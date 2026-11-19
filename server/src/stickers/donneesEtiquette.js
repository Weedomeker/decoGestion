// Données imprimées sur une étiquette, communes au modèle éditable et à l'ancien PDF notice.
// Chaque clé est un jeton utilisable dans les textes d'un modèle : {numEx}, {ville}, {infos}…
const path = require("path");
const { findPreviewFile } = require("../getPreview");
const { cheminApercuSurMesure } = require("../surMesure/nomFichier");

const PREVIEW_DIR = path.join(__dirname, "../../public/PREVIEW");

const JETONS = [
  { cle: "numEx", libelle: "N° commande + exemplaire", exemple: "169580 01/03" },
  { cle: "numCmd", libelle: "N° commande", exemple: "169580" },
  { cle: "ex", libelle: "Exemplaire", exemple: "01/03" },
  { cle: "ville", libelle: "Ville", exemple: "AMIENS" },
  { cle: "deco", libelle: "Décor", exemple: "JARDIN SECRET" },
  { cle: "ref", libelle: "Référence", exemple: "3612345678901" },
  { cle: "format", libelle: "Format", exemple: "80x210" },
  { cle: "orientation", libelle: "Gauche / Droit / Centre", exemple: "GAUCHE" },
  { cle: "client", libelle: "Enseigne", exemple: "LM" },
  { cle: "infos", libelle: "Ligne d'infos complète", exemple: "AMIENS JARDIN SECRET GAUCHE 3612345678901 80X210" },
];

// Nom propre CASTO : "CRED 300x60cm MOSAIQUE 3664711694254 MAT.pdf" → "MOSAIQUE"
function cleanCastoName(str) {
  return str
    ?.replace(/\d{2,}x\d{2,}/i, "")
    ?.replace("cm", "")
    ?.replace("CRED", "")
    ?.replace(/\d{13}/, "")
    ?.replace("MAT.pdf", "")
    ?.replace("BRILLANT.pdf", "")
    .trim();
}

function nomVisuel(client, visuelRaw) {
  if (client === "CASTO") return cleanCastoName(visuelRaw);
  return visuelRaw?.split(/\d{2,}x\d{2,}/i)[0]?.trim();
}

/**
 * @param {object} cmd job (ou job synthétique de l'onglet Sticker), avec visuelIndex 1 ou 2
 * @param {number|string} numCmd n° de commande imprimé
 * @param {string} ex numérotation "NN/TT"
 * @param {object} [opts] { files: liste du dossier PREVIEW, jpgSurMesureDir: dossier des aperçus sur-mesure }
 */
function donneesEtiquette(cmd, numCmd, ex, opts = {}) {
  const useSecond = cmd.visuelIndex === 2;
  const visuelRaw = useSecond ? cmd.visuel2 : cmd.visuel;
  const ref = useSecond ? cmd.ref2 : cmd.ref;
  const formatRaw = useSecond ? cmd.format2_visu : cmd.format_visu;

  const stock = Boolean(cmd.isStock || cmd.showStock);
  const numEx = stock ? "STOCK" : Number(numCmd) > 0 ? `${numCmd} ${ex}` : "";

  const orientationMatch = cmd.smBase ? cmd.orientation && [cmd.orientation] : visuelRaw?.match(/(gauche|droit|centre)/i);
  const orientation = orientationMatch ? String(orientationMatch[0]).toUpperCase() : "";

  const deco = nomVisuel(cmd.client, visuelRaw) || "";
  const format = cmd.smFormat || formatRaw?.split("_").pop().replace("/", "").trim() || "";
  const refStr = ref && ref !== 0 ? String(ref) : "";

  const infoCommande = cmd.smBase
    ? [cmd.ville || "", cmd.ref || "", cmd.orientation || "", cmd.smFormat]
    : [cmd.ville || "", deco, orientationMatch ? orientationMatch[0] : "", refStr, format || "Format inconnu"];

  // Miniature : recherchée par ref (cf. findPreviewFile) ; un sur-mesure a la sienne.
  let miniaturePath = null;
  let miniatureFichier = null;
  if (cmd.smBase) {
    if (opts.jpgSurMesureDir) miniaturePath = cheminApercuSurMesure(opts.jpgSurMesureDir, cmd.smBase);
  } else if (refStr) {
    miniatureFichier = findPreviewFile(refStr, visuelRaw, opts.files || []) || null;
    if (miniatureFichier) miniaturePath = path.join(opts.previewDir || PREVIEW_DIR, miniatureFichier);
  }

  return {
    numEx,
    numCmd: stock || !(Number(numCmd) > 0) ? "" : String(numCmd),
    ex: stock ? "" : ex || "",
    ville: (cmd.ville || "").toUpperCase(),
    deco: deco.toUpperCase(),
    ref: cmd.smBase ? String(cmd.ref || "") : refStr,
    format: format.toUpperCase(),
    orientation,
    client: cmd.client || "",
    // Espaces compactés : un champ vide décentrait la ligne
    infos: infoCommande.join(" ").replace(/\s+/g, " ").trim().toUpperCase(),
    miniaturePath,
    miniatureFichier,
  };
}

// Remplace {jeton} par sa valeur ; un jeton inconnu reste tel quel pour se voir à l'aperçu.
function remplacerJetons(texte, donnees) {
  return String(texte ?? "").replace(/\{(\w+)\}/g, (tout, cle) =>
    Object.prototype.hasOwnProperty.call(donnees, cle) && typeof donnees[cle] === "string" ? donnees[cle] : tout,
  );
}

module.exports = { donneesEtiquette, remplacerJetons, cleanCastoName, JETONS, PREVIEW_DIR };
