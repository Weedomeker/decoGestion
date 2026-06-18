const mongoose = require("mongoose");
const logger = require("../logger/logger");
const refModels = require("../services/refModels");
const { getFiles } = require("../getFiles");
const { state } = require("../services/appState");
const { buildFileEntries, compareClientReferences } = require("../services/referencesCheckService");
const { compareClientReferencesWithGamesys } = require("../services/gamesysReferencesCheckService");
const { findStockByRefs } = require("../gamesys/services/stockReferenceLookupService");
const { getOdbcStatus } = require("../gamesys/config/db");

const CLIENT_DIR_KEY = { LM: "decoLM", CASTO: "decoCASTO", BRICO: "decoBRICO", ECOM: "decoECOM" };

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getModel(client, res) {
  const Model = refModels[client];
  if (!Model) {
    res.status(400).json({ error: `Client inconnu : "${client}". Attendu : ${Object.keys(refModels).join(", ")}` });
    return null;
  }
  return Model;
}

function sanitizePayload(client, body) {
  const { ref, model, finition, format, blanc } = body || {};
  const payload = {
    ref: typeof ref === "string" ? ref.trim() : ref,
    model: typeof model === "string" ? model.trim() : model,
    finition: typeof finition === "string" ? finition.trim() : finition,
    format: typeof format === "string" ? format.trim().toLowerCase() : format,
  };
  if (client === "ECOM") payload.blanc = Boolean(blanc);
  return payload;
}

async function listReferences(req, res) {
  const { client } = req.params;
  const Model = getModel(client, res);
  if (!Model) return;

  try {
    const { q, limit } = req.query;
    const filter = q ? { $or: [{ ref: new RegExp(escapeRegExp(q), "i") }, { model: new RegExp(escapeRegExp(q), "i") }] } : {};
    const parsedLimit = parseInt(limit, 10);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 2000) : 50;
    const docs = await Model.find(filter)
      .sort({ model: 1 })
      .limit(safeLimit)
      .lean();
    res.json(docs);
  } catch (error) {
    logger.error(`listReferences (${client}): ${error.message}`);
    res.status(500).json({ error: "Erreur lors de la lecture des références" });
  }
}

async function createReference(req, res) {
  const { client } = req.params;
  const Model = getModel(client, res);
  if (!Model) return;

  const payload = sanitizePayload(client, req.body);
  if (!payload.ref || !payload.model) {
    return res.status(400).json({ error: "Les champs \"ref\" et \"model\" sont obligatoires." });
  }

  try {
    const existing = await Model.findOne({ ref: payload.ref }).lean();
    if (existing) {
      return res.status(409).json({ error: `La référence "${payload.ref}" existe déjà pour ${client}.` });
    }
    const created = await Model.create(payload);
    res.status(201).json(created);
  } catch (error) {
    logger.error(`createReference (${client}): ${error.message}`);
    res.status(500).json({ error: "Erreur lors de la création de la référence" });
  }
}

async function updateReference(req, res) {
  const { client, id } = req.params;
  const Model = getModel(client, res);
  if (!Model) return;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Identifiant invalide" });
  }

  const payload = sanitizePayload(client, req.body);
  if (!payload.ref || !payload.model) {
    return res.status(400).json({ error: "Les champs \"ref\" et \"model\" sont obligatoires." });
  }

  try {
    const collision = await Model.findOne({ ref: payload.ref, _id: { $ne: id } }).lean();
    if (collision) {
      return res.status(409).json({ error: `La référence "${payload.ref}" existe déjà pour ${client}.` });
    }
    const updated = await Model.findByIdAndUpdate(id, payload, { new: true });
    if (!updated) {
      return res.status(404).json({ error: "Référence introuvable" });
    }
    res.json(updated);
  } catch (error) {
    logger.error(`updateReference (${client}): ${error.message}`);
    res.status(500).json({ error: "Erreur lors de la mise à jour de la référence" });
  }
}

async function deleteReference(req, res) {
  const { client, id } = req.params;
  const Model = getModel(client, res);
  if (!Model) return;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Identifiant invalide" });
  }

  try {
    const deleted = await Model.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: "Référence introuvable" });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error(`deleteReference (${client}): ${error.message}`);
    res.status(500).json({ error: "Erreur lors de la suppression de la référence" });
  }
}

async function checkReferences(req, res) {
  const report = {};

  for (const client of Object.keys(refModels)) {
    const Model = refModels[client];
    const dir = state.paths[CLIENT_DIR_KEY[client]];

    let dbRefs = [];

    if (!state.networkStatus[client]) {
      report[client] = {
        networkUnavailable: true,
        orphanFiles: [],
        missingFiles: [],
        formatMismatches: [],
        stats: null,
      };
    } else {
      try {
        const { files } = getFiles(dir, [], []);
        const fileEntries = buildFileEntries(files, client);
        dbRefs = await Model.find({}, "ref model format finition").lean();
        const result = compareClientReferences(fileEntries, dbRefs, client);
        report[client] = { networkUnavailable: false, ...result };
      } catch (error) {
        logger.error(`checkReferences (${client}): ${error.message}`);
        report[client] = {
          networkUnavailable: false,
          error: "Erreur lors du scan",
          orphanFiles: [],
          missingFiles: [],
          formatMismatches: [],
          stats: null,
        };
      }
    }

    if (getOdbcStatus() !== "connected") {
      report[client].gamesys = { unavailable: true, notFoundInGamesys: [], stats: null };
    } else {
      try {
        if (!dbRefs.length) dbRefs = await Model.find({}, "ref model format finition").lean();
        const stockMatches = await findStockByRefs(dbRefs.map((doc) => doc.ref));
        report[client].gamesys = {
          unavailable: false,
          ...compareClientReferencesWithGamesys(dbRefs, stockMatches, client),
        };
      } catch (error) {
        logger.error(`checkReferences gamesys (${client}): ${error.message}`);
        report[client].gamesys = {
          unavailable: true,
          error: "Erreur lors de la vérification Gamesys",
          notFoundInGamesys: [],
          stats: null,
        };
      }
    }
  }

  res.json({ ...report, scannedAt: new Date().toISOString() });
}

module.exports = { listReferences, createReference, updateReference, deleteReference, checkReferences };
