const mongoose = require("mongoose");

const refCastoSchema = new mongoose.Schema(
  {
    ref: { type: String },
    model: { type: String },
    finition: { type: String },
    format: { type: String },
  },
  { collection: "casto_ref_deco" },
); // préciser le nom exact de la collection Mongo

const RefCasto = mongoose.model("RefCasto", refCastoSchema);

module.exports = RefCasto;
