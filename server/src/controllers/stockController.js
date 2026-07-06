const findStock = require("../findStock");
const { extractRefFromFilename } = require("../services/referencesCheckService");
const StockProfile = require("../models/StockProfile");

async function getStock(req, res) {
  let { ref, filename, client } = req.body;
  if (!ref && filename && client) {
    ref = extractRefFromFilename(filename, client) || undefined;
  }
  if (!ref) return res.status(400).json({ error: "Ref required" });

  try {
    const stock = await findStock(ref);
    if (stock) return res.status(200).json({ stock });
    return res.status(404).json({ error: "Stock not found" });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function getStockProfiles(req, res) {
  const { q, type } = req.query;
  try {
    const filter = {};
    if (type === "profil" || type === "kit") filter.type = type;
    if (q && q.trim()) {
      const regex = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ ref: regex }, { modele: regex }, { libelle: regex }, { codeArticle: regex }];
    }
    const items = await StockProfile.find(filter).sort({ type: 1, libelle: 1 }).limit(300).lean();
    return res.json(items);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function createStockProfile(req, res) {
  const { ref, modele, libelle, type, codeArticle, famille, sousFamille, stockDisponible } = req.body;
  if (!ref || !type) return res.status(400).json({ error: "ref et type sont requis." });
  if (!["profil", "kit"].includes(type)) return res.status(400).json({ error: "type doit être 'profil' ou 'kit'." });
  try {
    const doc = await StockProfile.create({ ref, modele, libelle, type, codeArticle, famille, sousFamille, stockDisponible: Number(stockDisponible) || 0 });
    return res.status(201).json(doc);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: `La référence "${ref}" existe déjà.` });
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function updateStockProfile(req, res) {
  const { id } = req.params;
  const { ref, modele, libelle, type, codeArticle, famille, sousFamille, stockDisponible } = req.body;
  if (type && !["profil", "kit"].includes(type)) return res.status(400).json({ error: "type doit être 'profil' ou 'kit'." });
  try {
    const update = {};
    if (ref !== undefined) update.ref = ref;
    if (modele !== undefined) update.modele = modele;
    if (libelle !== undefined) update.libelle = libelle;
    if (type !== undefined) update.type = type;
    if (codeArticle !== undefined) update.codeArticle = codeArticle;
    if (famille !== undefined) update.famille = famille;
    if (sousFamille !== undefined) update.sousFamille = sousFamille;
    if (stockDisponible !== undefined) update.stockDisponible = Number(stockDisponible) || 0;
    const doc = await StockProfile.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: "Article introuvable." });
    return res.json(doc);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: `La référence "${ref}" existe déjà.` });
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function deleteStockProfile(req, res) {
  const { id } = req.params;
  try {
    const doc = await StockProfile.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ error: "Article introuvable." });
    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = {
  getStock,
  getStockProfiles,
  createStockProfile,
  updateStockProfile,
  deleteStockProfile,
};
