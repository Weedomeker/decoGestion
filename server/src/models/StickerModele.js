const mongoose = require("mongoose");

// Modèle d'étiquette : éléments positionnés en mm sur une page A6 (cf. server/src/stickers/renderSticker.js).
// Un seul modèle par défaut par enseigne : c'est lui qu'utilisent les étiquettes des jobs.
const stickerModeleSchema = new mongoose.Schema(
  {
    nom: { type: String, required: true, trim: true },
    client: { type: String, enum: ["LM", "CASTO", "BRICO", "ECOM", null], default: null },
    parDefaut: { type: Boolean, default: false },
    elements: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true, minimize: false },
);

stickerModeleSchema.index({ client: 1, parDefaut: 1 });

module.exports = mongoose.model("StickerModele", stickerModeleSchema);
