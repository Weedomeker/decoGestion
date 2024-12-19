const mongoose = require('mongoose');

const Deco = mongoose.model('lm_commandes', {
  date: Date,
  numCmd: Number,
  mag: String,
  dibond: String,
  deco: String,
  ref: Number,
  format: String,
  ex: Number,
  temps: Number,
  perte: mongoose.Decimal128,
  app_version: String,
  ip: String,
});

module.exports = Deco;
