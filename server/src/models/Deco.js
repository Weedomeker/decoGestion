const mongoose = require('mongoose');

const decoSchema = new mongoose.Schema({
  date: { type: Date },
  numCmd: { type: Number },
  mag: { type: String },
  dibond: { type: String },
  deco: { type: String },
  ref: { type: Number },
  format: { type: String },
  ex: { type: Number },
  temps: { type: Number },
  perte: { type: Number },
  status: { type: String },
  app_version: { type: String },
  ip: { type: String },
});

const Deco = mongoose.model('lm_commandes', decoSchema);

module.exports = Deco;
