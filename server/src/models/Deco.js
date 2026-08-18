const mongoose = require("mongoose");
const RefDeco = require("./RefDeco");
const RefCasto = require("./RefCasto");
const RefBrico = require("./RefBrico");
const RefEcom = require("./RefEcom");
const logger = require("../../src/logger/logger");

// Schéma des commandes
const decoSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  dateLivraisonSouhaitee: { type: Date },
  prixTotal: { type: Number },
  client: { type: String, enum: ["LM", "CASTO", "BRICO", "ECOM", ""] },
  numCmd: { type: Number, min: 1 },
  mag: { type: String },
  dibond: { type: String },
  deco: { type: String },
  ref: { type: String },
  format: { type: String },
  finition: { type: String, default: "" },
  ex: { type: Number, min: 1, max: 9999 },
  temps: { type: Number, min: 0 },
  perte: { type: Number },
  status: { type: String },
  app_version: { type: String },
  ip: { type: String },
  comment: { type: String, default: "" },
  prodBlanc: { type: Boolean, default: false },
  pkOnly: { type: Boolean, default: false },
}, { timestamps: true });

decoSchema.index({ numCmd: 1, client: 1 });
decoSchema.index({ date: -1 });

const clientRefOrder = {
  LM: [RefDeco, RefCasto, RefBrico, RefEcom],
  CASTO: [RefCasto, RefDeco, RefBrico, RefEcom],
  BRICO: [RefBrico, RefDeco, RefCasto, RefEcom],
  ECOM: [RefEcom, RefDeco, RefCasto, RefBrico],
};

// Hook avant save
decoSchema.pre("save", async function (next) {
  try {
    if (this.isModified("ref") && this.ref) {
      const refs = clientRefOrder[this.client?.toUpperCase()] || [RefDeco, RefCasto, RefBrico, RefEcom];
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
      const clientKey = data.client?.toUpperCase() || this.getFilter()?.client?.toUpperCase();
      const refs = clientRefOrder[clientKey] || [RefDeco, RefCasto, RefBrico, RefEcom];

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
