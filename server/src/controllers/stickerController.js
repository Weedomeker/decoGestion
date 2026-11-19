// Modèles d'étiquettes éditables (onglet Sticker) : CRUD des modèles, images importées, pictos.
const fs = require("fs");
const mongoose = require("mongoose");
const StickerModele = require("../models/StickerModele");
const StickerImage = require("../models/StickerImage");
const logger = require("../logger/logger");
const { normaliserElements } = require("../stickers/renderSticker");
const { PICTOS } = require("../stickers/pictos");
const { JETONS, donneesEtiquette, PREVIEW_DIR } = require("../stickers/donneesEtiquette");
const { viderCache, dimensionsImage } = require("../stickers/modeles");
const { chercherApercus } = require("../stickers/miniatureForcee");

const CLIENTS = ["LM", "CASTO", "BRICO", "ECOM"];
const TAILLE_MAX_IMAGE = 2 * 1024 * 1024;
const MIMES = ["image/png", "image/jpeg"];

const champsModele = (body) => {
  const nom = typeof body.nom === "string" ? body.nom.trim().slice(0, 80) : "";
  const client = CLIENTS.includes(body.client) ? body.client : null;
  return { nom, client, elements: normaliserElements(body.elements) };
};

// Un seul modèle par défaut par enseigne : le nouveau défaut retire le drapeau aux autres.
async function retirerAutresDefauts(client, id) {
  await StickerModele.updateMany({ client, parDefaut: true, _id: { $ne: id } }, { $set: { parDefaut: false } });
}

async function listerModeles(req, res) {
  try {
    const modeles = await StickerModele.find({}, { nom: 1, client: 1, parDefaut: 1, elements: 1, updatedAt: 1 })
      .sort({ client: 1, parDefaut: -1, nom: 1 })
      .lean();
    res.json(modeles);
  } catch (error) {
    logger.error("Erreur listerModeles:", error);
    res.status(500).json({ error: "Erreur de lecture des modèles d'étiquette" });
  }
}

async function creerModele(req, res) {
  const champs = champsModele(req.body || {});
  if (!champs.nom) return res.status(400).json({ error: "Le nom du modèle est requis" });
  const parDefaut = Boolean(req.body.parDefaut) && Boolean(champs.client);
  try {
    const modele = await StickerModele.create({ ...champs, parDefaut });
    if (parDefaut) await retirerAutresDefauts(champs.client, modele._id);
    viderCache();
    res.status(201).json(modele.toObject());
  } catch (error) {
    logger.error("Erreur creerModele:", error);
    res.status(500).json({ error: "Erreur d'enregistrement du modèle" });
  }
}

async function modifierModele(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Identifiant invalide" });
  try {
    const modele = await StickerModele.findById(id);
    if (!modele) return res.status(404).json({ error: "Modèle introuvable" });
    const body = req.body || {};
    if ("nom" in body) {
      const nom = typeof body.nom === "string" ? body.nom.trim().slice(0, 80) : "";
      if (!nom) return res.status(400).json({ error: "Le nom du modèle est requis" });
      modele.nom = nom;
    }
    if ("client" in body) {
      const client = CLIENTS.includes(body.client) ? body.client : null;
      // Changer l'enseigne d'un modèle par défaut laisserait l'ancienne enseigne sans modèle.
      if (modele.parDefaut && client !== modele.client) {
        return res.status(409).json({ error: "Désignez d'abord un autre modèle par défaut pour cette enseigne" });
      }
      modele.client = client;
    }
    if ("elements" in body) {
      modele.elements = normaliserElements(body.elements);
      modele.markModified("elements");
    }
    if (body.parDefaut === true) {
      if (!modele.client) return res.status(400).json({ error: "Choisissez l'enseigne du modèle par défaut" });
      modele.parDefaut = true;
    } else if (body.parDefaut === false && modele.parDefaut) {
      return res.status(409).json({ error: "Désignez un autre modèle par défaut à la place" });
    }
    await modele.save();
    if (modele.parDefaut) await retirerAutresDefauts(modele.client, modele._id);
    viderCache();
    res.json(modele.toObject());
  } catch (error) {
    logger.error("Erreur modifierModele:", error);
    res.status(500).json({ error: "Erreur d'enregistrement du modèle" });
  }
}

async function supprimerModele(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Identifiant invalide" });
  try {
    const modele = await StickerModele.findById(id, { parDefaut: 1 }).lean();
    if (!modele) return res.status(404).json({ error: "Modèle introuvable" });
    // Les étiquettes des jobs utilisent le modèle par défaut : on ne laisse pas une enseigne sans modèle.
    if (modele.parDefaut) {
      return res.status(409).json({ error: "Modèle par défaut : désignez-en un autre avant de le supprimer" });
    }
    await StickerModele.deleteOne({ _id: id });
    viderCache();
    res.json({ ok: true });
  } catch (error) {
    logger.error("Erreur supprimerModele:", error);
    res.status(500).json({ error: "Erreur de suppression du modèle" });
  }
}

function listerPictos(req, res) {
  res.json({ pictos: PICTOS, jetons: JETONS });
}

async function listerImages(req, res) {
  try {
    const images = await StickerImage.find({}, { nom: 1, mime: 1, largeur: 1, hauteur: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .lean();
    res.json(images);
  } catch (error) {
    logger.error("Erreur listerImages:", error);
    res.status(500).json({ error: "Erreur de lecture des images" });
  }
}

// Import par data URL (JSON) : pas de multipart dans le projet, et les logos restent petits (≤ 2 Mo).
async function importerImage(req, res) {
  const { nom, dataUrl } = req.body || {};
  const m = typeof dataUrl === "string" && dataUrl.match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/);
  if (!m || !MIMES.includes(m[1])) return res.status(400).json({ error: "Image PNG ou JPG attendue" });
  const data = Buffer.from(m[2], "base64");
  if (data.length > TAILLE_MAX_IMAGE) return res.status(413).json({ error: "Image trop lourde (2 Mo maximum)" });
  const dims = dimensionsImage(data);
  if (!dims) return res.status(400).json({ error: "Image illisible" });
  const nomPropre = (typeof nom === "string" && nom.trim().slice(0, 80)) || "Image";
  try {
    const img = await StickerImage.create({ nom: nomPropre, mime: m[1], data, ...dims });
    res.status(201).json({ _id: img._id, nom: img.nom, mime: img.mime, largeur: dims.largeur, hauteur: dims.hauteur });
  } catch (error) {
    logger.error("Erreur importerImage:", error);
    res.status(500).json({ error: "Erreur d'enregistrement de l'image" });
  }
}

async function lireImage(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Identifiant invalide" });
  try {
    const img = await StickerImage.findById(id, { data: 1, mime: 1 }).lean();
    if (!img) return res.status(404).json({ error: "Image introuvable" });
    res.setHeader("Content-Type", img.mime);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(Buffer.from(img.data.buffer || img.data));
  } catch (error) {
    logger.error("Erreur lireImage:", error);
    res.status(500).json({ error: "Erreur de lecture de l'image" });
  }
}

async function supprimerImage(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Identifiant invalide" });
  try {
    const utilisee = await StickerModele.exists({ "elements.imageId": id });
    if (utilisee) return res.status(409).json({ error: "Image utilisée par un modèle" });
    await StickerImage.deleteOne({ _id: id });
    res.json({ ok: true });
  } catch (error) {
    logger.error("Erreur supprimerImage:", error);
    res.status(500).json({ error: "Erreur de suppression de l'image" });
  }
}

// Valeurs des champs automatiques pour l'éditeur, calculées comme pour l'étiquette imprimée
// (première étiquette du lot : 01/NN), avec l'URL de la miniature trouvée par référence.
async function donneesApercu(req, res) {
  const { client, numCmd, ex, ville, ref, visuel, format_visu, isStock } = req.body || {};
  let files = [];
  try {
    files = await fs.promises.readdir(PREVIEW_DIR);
  } catch {
    files = []; // dossier PREVIEW absent : pas de miniature
  }
  const total = String(Math.max(1, Number(ex) || 1)).padStart(2, "0");
  const d = donneesEtiquette(
    {
      client: CLIENTS.includes(client) ? client : "",
      ville: String(ville || "").toUpperCase(),
      ref: ref || "",
      visuel: visuel || "",
      format_visu: format_visu || "",
      visuelIndex: 1,
      showStock: Boolean(isStock),
    },
    Number(numCmd) || 0,
    `01/${total}`,
    { files },
  );
  // Le chemin disque de la miniature n'est jamais renvoyé au navigateur : seulement son URL publique.
  const jetons = { ...d };
  delete jetons.miniaturePath;
  delete jetons.miniatureFichier;
  const { miniatureFichier } = d;
  res.json({ ...jetons, miniatureUrl: miniatureFichier ? `/public/PREVIEW/${encodeURIComponent(miniatureFichier)}` : null });
}

// Recherche d'un aperçu par son nom dans le dossier PREVIEW (commun à toutes les enseignes),
// pour imposer la miniature d'une étiquette sans passer par la référence.
async function rechercherApercus(req, res) {
  let files = [];
  try {
    files = await fs.promises.readdir(PREVIEW_DIR);
  } catch {
    return res.json([]); // dossier d'aperçus absent
  }
  res.json(
    chercherApercus(files, req.query.q).map((fichier) => ({
      fichier,
      url: `/public/PREVIEW/${encodeURIComponent(fichier)}`,
    })),
  );
}

module.exports = {
  rechercherApercus,
  donneesApercu,
  listerModeles,
  creerModele,
  modifierModele,
  supprimerModele,
  listerPictos,
  listerImages,
  importerImage,
  lireImage,
  supprimerImage,
  TAILLE_MAX_IMAGE,
};
