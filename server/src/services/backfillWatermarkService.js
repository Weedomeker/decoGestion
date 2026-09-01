const logger = require("../logger/logger");
const BackfillWatermark = require("../models/BackfillWatermark");

const JOUR_MS = 24 * 60 * 60 * 1000;

// sinceDate = borne la plus RÉCENTE entre (now - fenêtre défaut) et (dernier run - marge).
// Au 1er run (pas de watermark) => fenêtre défaut pleine. Aux runs suivants => petit delta.
async function resolveSinceDate({ cle, fenetreDefautJours, margeJours = 1 }) {
  const parDefaut = new Date(Date.now() - fenetreDefautJours * JOUR_MS);
  try {
    const doc = await BackfillWatermark.findById(cle).lean();
    if (!doc || !doc.ranAt) return parDefaut;
    const depuisDernierRun = new Date(doc.ranAt.getTime() - margeJours * JOUR_MS);
    return depuisDernierRun > parDefaut ? depuisDernierRun : parDefaut;
  } catch (err) {
    logger.warn(`backfillWatermark: lecture ${cle} échouée, fenêtre défaut : ${err.message}`);
    return parDefaut;
  }
}

async function marquerRun(cle) {
  try {
    await BackfillWatermark.updateOne({ _id: cle }, { $set: { ranAt: new Date() } }, { upsert: true });
  } catch (err) {
    logger.warn(`backfillWatermark: écriture ${cle} échouée : ${err.message}`);
  }
}

module.exports = { resolveSinceDate, marquerRun };
