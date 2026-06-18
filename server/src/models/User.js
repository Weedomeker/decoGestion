const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  uid: { type: String, unique: true, sparse: true }, // Identifiant unique
  deviceFingerprint: { type: String, unique: true, sparse: true }, // Empreinte numérique
  adressIp: { type: String },
  createdAt: { type: Date, default: Date.now }, // Date de création
});

const User = mongoose.model("users", userSchema);

module.exports = User;
