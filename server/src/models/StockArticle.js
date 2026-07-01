const mongoose = require("mongoose");

const stockArticleSchema = new mongoose.Schema(
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

stockArticleSchema.index({ type: 1 });

const StockArticle = mongoose.model("StockArticle", stockArticleSchema, "stock_profiles");

module.exports = StockArticle;
