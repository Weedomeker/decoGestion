const mongoose = require("mongoose");

const stocksSchema = new mongoose.Schema(
  {
    visuel: { type: String },
    finition: { type: String, default: "" },
    format: { type: String },
    ref: { type: String },
    ex: { type: Number },
  },
  {
    timestamps: true,
  },
);

stocksSchema.post("findOneAndUpdate", async function (doc) {
  if (doc && doc.ex === 0) {
    await doc.deleteOne();
  }
});

stocksSchema.index({ ref: 1 });

const Stocks = mongoose.model("stocks", stocksSchema);

module.exports = Stocks;
