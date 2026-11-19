const mongoose = require("mongoose");

// Image importée pour les étiquettes (logo, picto maison). En base plutôt que dans public/ :
// le poste de production est une recopie du dossier, les fichiers ajoutés y seraient perdus.
const stickerImageSchema = new mongoose.Schema(
  {
    nom: { type: String, required: true, trim: true },
    mime: { type: String, enum: ["image/png", "image/jpeg"], required: true },
    data: { type: Buffer, required: true },
    largeur: { type: Number },
    hauteur: { type: Number },
  },
  { timestamps: true },
);

module.exports = mongoose.model("StickerImage", stickerImageSchema);
