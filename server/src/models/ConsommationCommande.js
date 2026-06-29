const mongoose = require("mongoose");

const articleSchema = new mongoose.Schema(
  {
    ref:      { type: String },
    type:     { type: String, enum: ["profil", "kit"] },
    libelle:  { type: String, default: "" },
    quantite: { type: Number, default: 0 },
  },
  { _id: false }
);

const consommationCommandeSchema = new mongoose.Schema(
  {
    numCmd:  { type: Number, required: true },
    client:  { type: String, enum: ["LM", "CASTO", "BRICO", "ECOM"] },
    dateJob: { type: Date, default: Date.now },
    articles: [articleSchema],
  },
  { timestamps: true }
);

consommationCommandeSchema.index({ numCmd: 1 }, { unique: true });
consommationCommandeSchema.index({ dateJob: -1 });

const ConsommationCommande = mongoose.model(
  "ConsommationCommande",
  consommationCommandeSchema,
  "consommations_commandes"
);

module.exports = ConsommationCommande;
