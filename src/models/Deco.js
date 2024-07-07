const mongoose = require('mongoose');

const Deco = mongoose.model('lm_commandes', {
  Date: Date,
  numCmd: Number,
  Mag: String,
  Dibond: String,
  Deco: String,
  Formats: String,
  Ref: Number,
  Exs: Number,
  Temps: Number,
  Perte_m2: Number,
  app_version: String,
  ip: String,
});

module.exports = Deco;
