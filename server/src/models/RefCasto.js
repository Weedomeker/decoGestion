const mongoose = require("mongoose");

const refCastoSchema = new mongoose.Schema(
  {
    ref: { type: String, unique: true },
    model: { type: String },
    finition: { type: String },
    format: { type: String },
  },
  { collection: "casto_ref_deco" },
); // préciser le nom exact de la collection Mongo

refCastoSchema.index({ model: "text", finition: "text" });
refCastoSchema.index({ model: 1 }); // tri listReferences .sort({ model: 1 })

const RefCasto = mongoose.model("RefCasto", refCastoSchema);

module.exports = RefCasto;
