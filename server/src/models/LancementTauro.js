const mongoose = require("mongoose");

// Journal des lancements Tauro : une entrée par clé (commande/sous-dossier) envoyée au RIP.
const lancementTauroSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  jour: { type: String }, // AAAA-MM-JJ, heure locale
  job: { type: String },
  hf: { type: String },
  source: { type: String, default: "" },
  octets: { type: Number },
  cle: { type: String },
  cmd: { type: String, default: "" },
  ex: { type: Number },
  signature: { type: String },
  mode: { type: String, enum: ["session", "hors-session"], default: "session" },
  nomSansSession: { type: String },
  jobId: { type: String },
});

lancementTauroSchema.index({ jour: 1 });
lancementTauroSchema.index({ cle: 1 });
lancementTauroSchema.index({ cmd: 1 });
lancementTauroSchema.index({ nomSansSession: 1 });

module.exports = mongoose.model("LancementTauro", lancementTauroSchema);
