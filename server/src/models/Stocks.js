const mongoose = require("mongoose");

const stocksSchema = new mongoose.Schema(
  {
    visuel: { type: String },
    finition: { type: String, default: "" },
    format: { type: String },
    ref: { type: Number },
    ex: { type: Number },
  },
  {
    timestamps: true,
  },
);

const Stocks = mongoose.model("stocks", stocksSchema);

module.exports = Stocks;
