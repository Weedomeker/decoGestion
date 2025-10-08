const mongoose = require('mongoose');
const RefDeco = require('./RefDeco');

// Schéma des commandes
const decoSchema = new mongoose.Schema({
  date: { type: Date },
  numCmd: { type: Number },
  mag: { type: String },
  dibond: { type: String },
  deco: { type: String },
  ref: { type: Number },
  format: { type: String },
  finition: { type: String, default: '' },
  ex: { type: Number },
  temps: { type: Number },
  perte: { type: Number },
  status: { type: String },
  app_version: { type: String },
  ip: { type: String },
});

// Hook avant save
decoSchema.pre('save', async function (next) {
  try {
    if (this.isModified('ref') && this.ref) {
      const refData = await RefDeco.findOne({ 'REF LM': this.ref });

      if (refData) {
        this.finition = refData['FINITION VERNIS'] || '';
        this.format = refData['FORMAT'] || this.format;
        this.deco = refData['NOM DU MODELE'] || this.deco;
      } else {
        // si pas trouvé → vider finition et déco
        this.finition = '';
      }
    }
    next();
  } catch (err) {
    console.error('Erreur pre-save:', err);
    next(err);
  }
});

// Hook avant update (findOneAndUpdate)
decoSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const update = this.getUpdate();

    if (update.ref) {
      const refData = await RefDeco.findOne({ 'REF LM': update.ref });

      if (refData) {
        update.finition = refData['FINITION VERNIS'] || '';
        update.format = refData['FORMAT'] || update.format;
        update.deco = refData['NOM DU MODELE'] || update.deco;
      } else {
        update.finition = '';
      }

      this.setUpdate(update);
    }
    next();
  } catch (err) {
    console.error('Erreur pre-findOneAndUpdate:', err);
    next(err);
  }
});

const Deco = mongoose.model('Deco', decoSchema, 'lm_commandes');

module.exports = Deco;
