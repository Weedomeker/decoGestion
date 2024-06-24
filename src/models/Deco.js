const mongoose = require('mongoose');

const Deco = mongoose.model('Deco', {
  _id: Number,
  date: String,
  time: String,
  cmd: Number,
  ville: String,
  format_visu: String,
  format_Plaque: String,
  visuel: String,
  ex: Number,
  visuPath: String,
  writePath: String,
  jpgName: String,
  reg: Boolean,
  perte: String,
});

module.exports = Deco;
