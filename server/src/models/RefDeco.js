const mongoose = require("mongoose");

const refDecoSchema = new mongoose.Schema(
  {
    "REF LM": { type: Number, required: true },
    "NOM DU MODELE": { type: String },
    "FINITION VERNIS": { type: String },
    FORMAT: { type: String },
  },
  { collection: "lm_ref_deco" },
); // préciser le nom exact de la collection Mongo

const RefDeco = mongoose.model("RefDeco", refDecoSchema);

module.exports = RefDeco;
