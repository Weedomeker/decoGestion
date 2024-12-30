const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  uid: { type: String, unique: true }, // Identifiant unique
  deviceFingerprint: { type: String, unique: true }, // Empreinte numérique
  adressIp: { type: String, unique: true },
  createdAt: { type: Date, default: Date.now }, // Date de création
});

const User = mongoose.model('users', userSchema);

module.exports = User;
