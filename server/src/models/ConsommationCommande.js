const mongoose = require("mongoose");

const articleSchema = new mongoose.Schema(
  {
    ref: { type: String },
    type: { type: String, enum: ["profil", "kit"] },
    libelle: { type: String, default: "" },
    quantite: { type: Number, default: 0 },
    prix: { type: Number },
  },
  { _id: false },
);

const consommationCommandeSchema = new mongoose.Schema(
  {
    numCmd: { type: Number, required: true },
    client: { type: String, enum: ["LM", "CASTO", "BRICO", "ECOM", "PRO"] },
    // Date réelle de la commande Gamesys (dos_date) — à ne pas confondre avec createdAt
    // (timestamps: true) qui reflète le moment du traitement/import. Nécessaire pour les
    // prévisions de stock par période réelle d'achat.
    dateCommande: { type: Date },
    // Dates issues de Gamesys (ff_livraison.bo_date_depart_usine / bo_date_souhaitee) — utiles
    // pour les prévisions de stock par échéance de production/livraison.
    dateDepartUsine: { type: Date },
    dateLivraisonSouhaitee: { type: Date },
    // Métadonnées commande Gamesys (mêmes sources que Deco, cf. server/src/models/Deco.js) — utiles
    // pour ventiler les prévisions de stock par magasin/enseigne/client.
    codeClient: { type: String },
    refClient: { type: String },
    // Ville de livraison (magasin LM/CASTO/BRICO), ou nom du destinataire pour ECOM (livraison
    // directe au client final, pas de notion de magasin) — cf. decoGamesysStubSyncService.js.
    mag: { type: String },
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
