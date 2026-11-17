const express = require("express");
const { state } = require("../services/appState");
const { selectJobs } = require("../services/queueControlService");
const { calculerPlan, serialiser } = require("../tauro/planTauro");

const router = express.Router();

// Aperçu du lancement Tauro pour la sélection (ids) ou toute la file
router.post("/tauro/plan", async (req, res) => {
  try {
    const { ids, mode, finition, relancer } = req.body || {};
    if (finition !== undefined && !["MAT", "BRI"].includes(String(finition).toUpperCase())) {
      return res.status(400).json({ error: `Finition invalide : ${finition} (MAT ou BRI)` });
    }
    if (relancer !== undefined && !(Array.isArray(relancer) && relancer.every((r) => typeof r === "string"))) {
      return res.status(400).json({ error: "relancer doit être une liste" });
    }
    const jobs = selectJobs(state.jobs.jobs, ids);
    if (!jobs.length) return res.status(400).json({ error: "Aucun job sélectionné." });
    const plan = await calculerPlan(jobs, { mode, finition, relancer: relancer || [] });
    res.json(serialiser(plan));
  } catch (error) {
    const invalide = /Mode de lancement invalide/.test(error.message);
    res.status(invalide ? 400 : 500).json({ error: error.message });
  }
});

module.exports = router;
