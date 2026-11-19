// Accès aux modèles et images d'étiquettes, avec cache mémoire : un lot de jobs produit des dizaines
// d'étiquettes, une requête Mongo par étiquette serait inutile. Le cache est vidé à chaque écriture.
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const StickerModele = require("../models/StickerModele");
const StickerImage = require("../models/StickerImage");
const logger = require("../logger/logger");
const { ENSEIGNES, LOGOS, DOSSIER_LOGOS, elementsStandard } = require("./modelesParDefaut");

const DUREE_CACHE_MS = 60 * 1000;
const cacheModeles = new Map(); // client → { elements, nom, at }
const cacheImages = new Map(); // id → { data, mime }

const mongoPret = () => mongoose.connection.readyState === 1;

function viderCache() {
  cacheModeles.clear();
}

// Modèle par défaut d'une enseigne, ou null (Mongo absent, aucun modèle) : l'appelant revient alors
// à l'ancien PDF notice. Jamais d'attente : sans connexion, Mongo bufferiserait la requête 10 s.
async function modeleParDefaut(client) {
  if (!client || !mongoPret()) return null;
  const cache = cacheModeles.get(client);
  if (cache && Date.now() - cache.at < DUREE_CACHE_MS) return cache.modele;
  const modele = await StickerModele.findOne({ client, parDefaut: true }).lean();
  cacheModeles.set(client, { modele, at: Date.now() });
  return modele;
}

async function chargerImage(id) {
  if (!mongoose.isValidObjectId(id) || !mongoPret()) return null;
  if (cacheImages.has(id)) return cacheImages.get(id);
  const img = await StickerImage.findById(id, { data: 1, mime: 1 }).lean();
  const res = img ? { data: Buffer.from(img.data.buffer || img.data), mime: img.mime } : null;
  if (res) cacheImages.set(id, res);
  return res;
}

// Largeur × hauteur en pixels d'un PNG (IHDR) ou d'un JPEG (premier segment SOF).
function dimensionsImage(buffer) {
  if (buffer.length > 24 && buffer[0] === 0x89 && buffer[1] === 0x50) {
    return { largeur: buffer.readUInt32BE(16), hauteur: buffer.readUInt32BE(20) };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buffer.length) {
      if (buffer[i] !== 0xff) return null;
      const marqueur = buffer[i + 1];
      const longueur = buffer.readUInt16BE(i + 2);
      if (marqueur >= 0xc0 && marqueur <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marqueur)) {
        return { hauteur: buffer.readUInt16BE(i + 5), largeur: buffer.readUInt16BE(i + 7) };
      }
      i += 2 + longueur;
    }
  }
  return null;
}

// Au démarrage : crée les modèles standard des enseignes qui n'ont pas encore de modèle par défaut,
// avec les logos extraits des anciennes notices (importés une seule fois en base).
async function amorcerModeles() {
  if (!mongoPret()) return;
  const logos = {};
  const idLogo = async (cle) => {
    if (logos[cle]) return logos[cle];
    const { nom, fichier } = LOGOS[cle];
    let img = await StickerImage.findOne({ nom }, { _id: 1 }).lean();
    if (!img) {
      const data = await fs.promises.readFile(path.join(DOSSIER_LOGOS, fichier));
      img = await StickerImage.create({ nom, mime: "image/png", data, ...dimensionsImage(data) });
      logger.info(`Étiquettes : logo "${nom}" importé`);
    }
    logos[cle] = String(img._id);
    return logos[cle];
  };

  for (const { client, nom, couleur, logo } of ENSEIGNES) {
    if (await StickerModele.exists({ client, parDefaut: true })) continue;
    await StickerModele.create({ nom, client, parDefaut: true, elements: elementsStandard(couleur, logo, await idLogo(logo)) });
    logger.info(`Étiquettes : modèle "${nom}" créé`);
  }
  viderCache();
}

module.exports = { modeleParDefaut, chargerImage, dimensionsImage, amorcerModeles, viderCache };
