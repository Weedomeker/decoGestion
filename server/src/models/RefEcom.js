const mongoose = require("mongoose");

const refEcomSchema = new mongoose.Schema(
  {
    ref: { type: String, unique: true },
    model: { type: String },
    finition: { type: String },
    format: { type: String },
    blanc: { type: Boolean },
  },
  { collection: "ecom_ref_deco" },
); // préciser le nom exact de la collection Mongo

// Aligné sur RefDeco/RefCasto/RefBrico : sans cet index, toute requête $text routée vers
// RefEcom lève une erreur (cf. jobsController.js "index texte manquant ?").
refEcomSchema.index({ model: "text", finition: "text" });
// Tri listReferences .sort({ model: 1 }) — l'index texte ci-dessus ne sert pas au tri.
refEcomSchema.index({ model: 1 });

const RefEcom = mongoose.model("RefEcom", refEcomSchema);

module.exports = RefEcom;
