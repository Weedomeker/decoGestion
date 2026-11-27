const express = require("express");
const { state } = require("../services/appState");
const queueControl = require("../services/queueControlService");
const { selectJobs } = queueControl;
const { broadcastWS } = require("../services/websocketService");
const logger = require("../logger/logger");
const { calculerPlan, serialiser } = require("../tauro/planTauro");
const { validerOptionsTauro, reprendreDepotTauro } = require("../tauro/lancerTauro");

const router = express.Router();

// Aperçu du lancement Tauro pour la sélection (ids) ou toute la file
router.post("/tauro/plan", async (req, res) => {
  try {
    const { ids, mode, finition, relancer, taille } = req.body || {};
    const invalide = validerOptionsTauro({ finition, relancer, taille });
    if (invalide) return res.status(400).json({ error: invalide });
    const jobs = selectJobs(state.jobs.jobs, ids);
    if (!jobs.length) return res.status(400).json({ error: "Aucun job sélectionné." });
    const plan = await calculerPlan(jobs, { mode, finition, relancer: relancer || [], taille });
    res.json(serialiser(plan));
  } catch (error) {
    const invalide = /Mode de lancement invalide/.test(error.message);
    res.status(invalide ? 400 : 500).json({ error: error.message });
  }
});

// PDF de session restés dans le dossier d'attente : dépôt repris, dans l'ordre (fileDepot.js)
router.post("/tauro/reprendre_depot", (req, res) =>
  reprendreDepotTauro(req, res, { state, queueControl, logger, broadcastWS }),
);

module.exports = router;
