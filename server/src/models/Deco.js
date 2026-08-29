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
  prix: { type: Number },
  client: { type: String, enum: ["LM", "CASTO", "BRICO", "ECOM", ""] },
  numCmd: { type: Number, min: 1 },
  // Suffixe du sous-dossier Gamesys (ex: "07" pour "167648/07") du visuel précis de ce document —
  // à combiner avec numCmd pour reconstituer le numéro complet. Vide pour les stubs pkOnly/gamesysStub
  // (pas rattachés à un seul visuel) et pour le flux de saisie manuelle.
  sousDossier: { type: String },
  // Suffixes des sous-dossiers Gamesys d'origine des profils/kits agrégés dans ce stub pkOnly (ex:
  // ["01","04"]) — un stub pkOnly peut regrouper des lignes venant de plusieurs sous-dossiers,
  // contrairement à un document visuel classique (sousDossier, singulier). Vide pour les documents
  // non-pkOnly.
  sousDossiers: { type: [String], default: undefined },
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
  surMesure: { type: Boolean, default: false },
  surMesureKind: { type: String }, // "visuel" | "teinte_masse" | (vide)
  orientation: { type: String },   // GAUCHE | CENTRE | DROIT | (vide)
  prodBlanc: { type: Boolean, default: false },
  pkOnly: { type: Boolean, default: false },
  dateCommande: { type: Date },
  codeClient: { type: String },
  refClient: { type: String },
  nombreProfil: { type: Number },
  nombreKitPose: { type: Number },
  formatPlaqueGamesys: { type: String },
  // true = document créé proactivement depuis Gamesys (voir decoGamesysStubSyncService),
  // avant tout traitement utilisateur ; repasse à false quand un job le réclame (claimStubOrCreate).
  gamesysStub: { type: Boolean, default: false },
}, { timestamps: true });

decoSchema.index({ numCmd: 1, client: 1 });
decoSchema.index({ date: -1 });

const clientRefOrder = {
  LM: [RefDeco, RefCasto, RefBrico, RefEcom],
  CASTO: [RefCasto, RefDeco, RefBrico, RefEcom],
  BRICO: [RefBrico, RefDeco, RefCasto, RefEcom],
  ECOM: [RefEcom, RefDeco, RefCasto, RefBrico],
};

// Résout finition/format/deco à partir d'un ref (recherché dans RefDeco/RefCasto/RefBrico/RefEcom,
// dans l'ordre de préférence du client) — logique partagée par les hooks pre-save/pre-findOneAndUpdate
// ci-dessous et par la création proactive de stubs par visuel (decoGamesysStubSyncService), qui a besoin
// de cette résolution en dehors d'un $set (les hooks ne s'exécutent pas sur un $setOnInsert).
async function resolveRefFields(client, ref) {
  if (!ref) return null;
  const refs = clientRefOrder[client?.toUpperCase()] || [RefDeco, RefCasto, RefBrico, RefEcom];
  let refData = null;
  for (const refModel of refs) {
    refData = await refModel.findOne({ ref });
    if (refData) break;
  }
  if (refData) {
    return { matched: true, finition: refData.finition ?? "", format: refData.format, deco: refData.model };
  }
  return { matched: false, finition: "" };
}

// Hook avant save
decoSchema.pre("save", async function (next) {
  try {
    if (this.isModified("ref") && this.ref) {
      const refFields = await resolveRefFields(this.client, this.ref);
      this.finition = refFields.finition;
      this.format = refFields.format ?? this.format;
      this.deco = refFields.deco ?? this.deco;
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
      const clientKey = data.client || this.getFilter()?.client;
      const refFields = await resolveRefFields(clientKey, data.ref);
      data.finition = refFields.finition;
      data.format = refFields.format ?? data.format;
      data.deco = refFields.deco ?? data.deco;

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
Deco.resolveRefFields = resolveRefFields;

module.exports = Deco;
