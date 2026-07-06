const mongoose = require("mongoose");

const articleSchema = new mongoose.Schema(
  {
    ref: { type: String },
    type: { type: String, enum: ["profil", "kit"] },
    libelle: { type: String, default: "" },
    quantite: { type: Number, default: 0 },
  },
  { _id: false },
);

const consommationCommandeSchema = new mongoose.Schema(
  {
    numCmd: { type: Number, required: true },
    client: { type: String, enum: ["LM", "CASTO", "BRICO", "ECOM"] },
    // Date réelle de la commande Gamesys (dos_date) — à ne pas confondre avec createdAt
    // (timestamps: true) qui reflète le moment du traitement/import. Nécessaire pour les
    // prévisions de stock par période réelle d'achat.
    dateCommande: { type: Date },
    // Dates issues de Gamesys (ff_livraison.bo_date_depart_usine / bo_date_souhaitee) — utiles
    // pour les prévisions de stock par échéance de production/livraison.
    dateDepartUsine: { type: Date },
    dateLivraisonSouhaitee: { type: Date },
    articles: [articleSchema],
  },
  { timestamps: true },
);

consommationCommandeSchema.index({ numCmd: 1 }, { unique: true });

const ConsommationCommande = mongoose.model(
  "ConsommationCommande",
  consommationCommandeSchema,
  "consommations_commandes",
);

module.exports = ConsommationCommande;
