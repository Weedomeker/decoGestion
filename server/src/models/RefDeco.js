const mongoose = require("mongoose");

const refDecoSchema = new mongoose.Schema(
  {
    ref: { type: String, unique: true },
    model: { type: String },
    finition: { type: String },
    format: { type: String },
  },
  { collection: "lm_ref_deco" },
); // préciser le nom exact de la collection Mongo

refDecoSchema.index({ model: "text", finition: "text" });
refDecoSchema.index({ model: 1 }); // tri listReferences .sort({ model: 1 })

const RefDeco = mongoose.model("RefDeco", refDecoSchema);

module.exports = RefDeco;
