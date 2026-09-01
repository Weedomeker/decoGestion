const mongoose = require("mongoose");

const stockProfileSchema = new mongoose.Schema(
  {
    ref: { type: String, required: true, unique: true },
    modele: { type: String, default: "" },
    libelle: { type: String, default: "" },
    type: { type: String, enum: ["profil", "kit"], required: true },
    codeArticle: { type: String, default: "" },
    famille: { type: String, default: "" },
    sousFamille: { type: String, default: "" },
    stockDisponible: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// La requête réelle (stockController) trie sur { type, libelle } — l'index composé sert le tri,
// contrairement à { type: 1 } seul (cardinalité 2, inexploitable).
stockProfileSchema.index({ type: 1, libelle: 1 });

const StockProfile = mongoose.model("StockProfile", stockProfileSchema, "stock_profiles");

module.exports = StockProfile;
