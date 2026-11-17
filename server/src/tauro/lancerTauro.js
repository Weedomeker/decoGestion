/*
  Lancement de la file en mode Tauro (POST /run_jobs avec `tauro`).
  Le plan est recalculé et comparé à l'aperçu (empreinte) avant d'enfiler `plan.aLancer`, les copies
  nommées pour Tauro ; la file de l'appli garde les jobs d'origine. Dépendances injectées : le contrôleur
  ne se charge pas sans Redis.
*/
const { performance } = require("perf_hooks");

const FINITIONS = ["MAT", "BRI"];

// Mêmes contrôles que l'aperçu (POST /tauro/plan). Renvoie le message d'erreur, ou null.
function validerOptionsTauro({ finition, relancer } = {}) {
  if (finition !== undefined && !FINITIONS.includes(String(finition).toUpperCase())) {
    return `Finition invalide : ${finition} (MAT ou BRI)`;
  }
  if (relancer !== undefined && !(Array.isArray(relancer) && relancer.every((r) => typeof r === "string"))) {
    return "relancer doit être une liste";
  }
  return null;
}

// Étiquettes dans l'ordre d'impression : ordreTauro croissant, puis les jobs sans ordre (hors session,
// sans PDF, lancement classique) dans leur ordre d'entrée. Le tri de JavaScript est stable.
function trierPourEtiquettes(jobs) {
  const aOrdre = (job) => Number.isFinite(job?.ordreTauro);
  return [...jobs].sort((a, b) => {
    if (aOrdre(a) && aOrdre(b)) return a.ordreTauro - b.ordreTauro;
    if (aOrdre(a)) return -1;
    if (aOrdre(b)) return 1;
    return 0;
  });
}

const n3 = (n) => String(n).padStart(3, "0");

// « Sessions S1711A (001–033), S1711B (034–068) » et/ou « hors session : N PDF » ; vide sinon.
function resumeSessions(plan) {
  const parties = [];
  const sessions = plan.sessions || [];
  if (sessions.length) {
    parties.push(`Sessions ${sessions.map((s) => `${s.code} (${n3(s.depart)}–${n3(s.dernier)})`).join(", ")}`);
  }
  const hors = (plan.horsSession || []).length;
  if (hors) parties.push(`hors session : ${hors} PDF`);
  return parties.join(" · ");
}

async function lancerTauro(req, res, deps) {
  const { state, queueControl, calculerPlan, logger, broadcastWS } = deps;
  const tauro = req.body.tauro || {};

  const invalide = validerOptionsTauro(tauro);
  if (invalide) return res.status(400).json({ error: invalide });

  // Synchrone, avant tout await : un second lancement simultané est refusé ici.
  if (!queueControl.reserver({ tauro: true })) {
    return res.status(409).json({ error: "Un traitement est déjà en cours" });
  }

  try {
    const jobs = queueControl.selectJobs(state.jobs.jobs, req.body.ids);
    if (jobs.length === 0) return res.status(400).json({ error: "Aucun job à lancer" });

    let plan;
    try {
      plan = await calculerPlan(jobs, { mode: tauro.mode, finition: tauro.finition, relancer: tauro.relancer || [] });
    } catch (error) {
      if (/Mode de lancement invalide/.test(error.message)) return res.status(400).json({ error: error.message });
      throw error;
    }

    if (plan.empreinte !== tauro.empreinte) {
      return res
        .status(409)
        .json({ code: "PLAN_CHANGE", error: "La file a changé depuis l'aperçu : rafraîchir l'aperçu." });
    }
    const aLancer = plan.aLancer || [];
    if (aLancer.length === 0) return res.status(400).json({ error: "Aucun job à lancer" });

    const concurrence = deps.getConcurrency();
    let refusDisque = deps.controlerEspaceDisque(aLancer, deps.tmpdir(), concurrence);
    if (refusDisque && process.env.NODE_ENV === "development" && state.paths.sortieDevSecours) {
      logger.warn(`${refusDisque.error} Sortie déplacée sur ${state.paths.sortieDevSecours}.`);
      const dossierTemporaire = deps.basculerSortieSecours(aLancer, state.paths.sortieDevSecours);
      refusDisque = deps.controlerEspaceDisque(aLancer, dossierTemporaire, concurrence);
    }
    if (refusDisque) {
      logger.warn(`File non lancée : ${refusDisque.error}`);
      return res.status(507).json(refusDisque);
    }

    state.jobs.completed = [];
    const startTime = performance.now();
    broadcastWS({ type: "start", startTime });

    const { failed, cancelled } = await queueControl.enqueueRun(
      aLancer,
      { sortFolder: req.body.sortFolder, ip: req.ip },
      { dejaReserve: true },
    );

    const traitees = state.jobs.completed.map(({ cmd, cmd2 }) => (cmd2 > 0 ? `${cmd}+${cmd2}` : cmd));
    const duree = ((performance.now() - startTime) / 1000).toFixed(0);
    const sessions = resumeSessions(plan);
    logger.info(
      `Traitement terminé en ${duree} s : ${aLancer.length} job(s), ${failed} en échec, ${cancelled} annulé(s)${
        sessions ? ` · ${sessions}` : ""
      }${traitees.length ? ` · ${traitees.join(", ")}` : ""}`,
    );

    // Par _id : la file garde les objets d'origine, sans les champs Tauro du plan.
    state.jobs.jobs = state.jobs.jobs.filter(
      (job) => !state.jobs.completed.some((completedJob) => completedJob._id === job._id),
    );

    broadcastWS({ type: "end", endTime: performance.now() });

    try {
      await deps.generateStickersForJobs(trierPourEtiquettes(state.jobs.completed));
    } catch (error) {
      logger.error("Génération des étiquettes échouée :", error);
    }

    return res.status(200).json({ message: "Jobs completed successfully" });
  } catch (error) {
    logger.error("Lancement Tauro échoué :", error);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    queueControl.liberer();
  }
}

module.exports = { lancerTauro, trierPourEtiquettes, validerOptionsTauro, resumeSessions };
