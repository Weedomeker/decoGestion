const mongoose = require("mongoose");

const refDecoSchema = new mongoose.Schema(
  {
    ref: { type: Number, required: true },
    model: { type: String },
    finition: { type: String },
    format: { type: String },
  },
  { collection: "lm_ref_deco" },
); // préciser le nom exact de la collection Mongo

const RefDeco = mongoose.model("RefDeco", refDecoSchema);

module.exports = RefDeco;
