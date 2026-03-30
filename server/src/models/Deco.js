const mongoose = require("mongoose");
const RefDeco = require("./RefDeco");
const RefCasto = require("./RefCasto");
const RefBrico = require("./RefBrico");
const logger = require("../../src/logger/logger");

// Schéma des commandes
const decoSchema = new mongoose.Schema({
  date: { type: Date },
  client: { type: String },
  numCmd: { type: Number },
  mag: { type: String },
  dibond: { type: String },
  deco: { type: String },
  ref: { type: String },
  format: { type: String },
  finition: { type: String, default: "" },
  ex: { type: Number },
  temps: { type: Number },
  perte: { type: Number },
  status: { type: String },
  app_version: { type: String },
  ip: { type: String },
});

// Hook avant save
decoSchema.pre("save", async function (next) {
  try {
    if (this.isModified("ref") && this.ref) {
      const refs = [RefDeco, RefCasto, RefBrico];
      let refData = null;
      for (const refModel of refs) {
        refData = await refModel.findOne({ ref: this.ref });

        if (refData) break;
      }

      if (refData) {
        this.finition = refData.finition ?? "";
        this.format = refData.format ?? this.format;
        this.deco = refData.model ?? this.deco;
      } else {
        this.finition = "";
      }
    }
    next();
  } catch (err) {
    logger.error("Erreur pre-save:", err);
    next(err);
  }
});

// Hook avant update (findOneAndUpdate)
decoSchema.pre("findOneAndUpdate", async function (next) {
  try {
    const update = this.getUpdate();

    // gérer les deux formats : direct ou $set
    const data = update.$set || update;

    if (data.ref) {
      const refs = [RefDeco, RefCasto, RefBrico];

      const results = await Promise.all(refs.map((refModel) => refModel.findOne({ ref: data.ref })));

      const refData = results.find((r) => r);

      if (refData) {
        data.finition = refData.finition ?? "";
        data.format = refData.format ?? data.format;
        data.deco = refData.model ?? data.deco;
      } else {
        data.finition = "";
      }

      // remettre dans le bon format
      if (update.$set) {
        update.$set = data;
      } else {
        Object.assign(update, data);
      }

      this.setUpdate(update);
    }

    next();
  } catch (err) {
    logger.error("Erreur pre-findOneAndUpdate:", err);
    next(err);
  }
});

const Deco = mongoose.model("Deco", decoSchema, "lm_commandes");

module.exports = Deco;
