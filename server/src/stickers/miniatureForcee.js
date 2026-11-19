// Miniature choisie à la main dans l'onglet Sticker, pour une étiquette seulement (jamais enregistrée
// dans un modèle : un modèle par défaut imprimerait la même image sur toutes les étiquettes des jobs).
// Deux sources : un aperçu du dossier PREVIEW choisi par son nom, ou un fichier importé du poste.
const fs = require("fs");
const path = require("path");
const { PREVIEW_DIR } = require("./donneesEtiquette");

const TAILLE_MAX = 5 * 1024 * 1024;
const MAX_RESULTATS = 40;

const erreur = (message, status = 400) => Object.assign(new Error(message), { status });

const mots = (texte) =>
  String(texte || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

// Aperçus dont le nom contient tous les mots cherchés (« galets 100x210 »), triés par nom.
function chercherApercus(files, q) {
  const cherches = mots(q);
  if (cherches.length === 0 || cherches.join("").length < 2) return [];
  return files
    .filter((f) => /\.jpe?g$/i.test(f))
    .filter((f) => {
      const nom = mots(f).join(" ");
      return cherches.every((m) => nom.includes(m));
    })
    .sort((a, b) => a.localeCompare(b, "fr"))
    .slice(0, MAX_RESULTATS);
}

/**
 * @param {object} body { apercu?: nom de fichier PREVIEW, miniatureDataUrl?: data URL PNG/JPEG }
 * @returns {{chemin?: string, data?: Buffer, nom: string} | null}
 * @throws Error avec status 400 / 404 / 413
 */
function lireMiniatureForcee({ apercu, miniatureDataUrl } = {}, dossier = PREVIEW_DIR) {
  if (miniatureDataUrl) {
    const m = typeof miniatureDataUrl === "string" && miniatureDataUrl.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw erreur("Miniature : image PNG ou JPG attendue");
    const data = Buffer.from(m[2], "base64");
    if (data.length > TAILLE_MAX) throw erreur("Miniature trop lourde (5 Mo maximum)", 413);
    return { data, nom: "fichier importé" };
  }
  if (apercu) {
    // Nom seul : jamais de chemin venu du navigateur (../ etc.)
    const nom = path.basename(String(apercu));
    if (nom !== String(apercu) || !/\.jpe?g$/i.test(nom)) throw erreur("Aperçu invalide");
    const chemin = path.join(dossier, nom);
    if (!fs.existsSync(chemin)) throw erreur(`Aperçu introuvable : ${nom}`, 404);
    return { chemin, nom };
  }
  return null;
}

module.exports = { chercherApercus, lireMiniatureForcee, TAILLE_MAX };
