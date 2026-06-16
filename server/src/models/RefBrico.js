const mongoose = require("mongoose");

const refBricoSchema = new mongoose.Schema(
  {
    ref: { type: String, unique: true },
    model: { type: String },
    finition: { type: String },
    format: { type: String },
  },
  { collection: "brico_ref_deco" },
); // préciser le nom exact de la collection Mongo

const RefBrico = mongoose.model("RefBrico", refBricoSchema);

module.exports = RefBrico;
