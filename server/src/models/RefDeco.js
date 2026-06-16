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

const RefDeco = mongoose.model("RefDeco", refDecoSchema);

module.exports = RefDeco;
