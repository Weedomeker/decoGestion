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

const RefEcom = mongoose.model("RefEcom", refEcomSchema);

module.exports = RefEcom;
