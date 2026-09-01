const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  { _id: { type: String }, ranAt: { type: Date, required: true } },
  { timestamps: true, versionKey: false },
);

module.exports = mongoose.model("BackfillWatermark", schema, "backfill_watermarks");
