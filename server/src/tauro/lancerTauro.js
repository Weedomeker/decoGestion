/*
  Lancement de la file en mode Tauro (POST /run_jobs avec `tauro`).
  Le plan est recalculé et comparé à l'aperçu (empreinte) avant d'enfiler `plan.aLancer`, les copies
  nommées pour Tauro ; la file de l'appli garde les jobs d'origine. Dépendances injectées : le contrôleur
  ne se charge pas sans Redis.
*/
const { performance } = require("perf_hooks");
const { formatDureeMs } = require("../utils/duree");
const fileDepot = require("./fileDepot");
const { deposerDepuisAttente } = require("./depotTauro");

const FINITIONS = ["MAT", "BRI"];

// Mêmes contrôles que l'aperçu (POST /tauro/plan). Renvoie le message d'erreur, ou null.
function validerOptionsTauro({ finition, relancer, taille } = {}) {
  if (finition !== undefined && !FINITIONS.includes(String(finition).toUpperCase())) {
    return `Finition invalide : ${finition} (MAT ou BRI)`;
  }
  if (relancer !== undefined && !(Array.isArray(relancer) && relancer.every((r) => typeof r === "string"))) {
    return "relancer doit être une liste";
  }
  if (taille !== undefined) {
    if (typeof taille !== "object" || taille === null || Array.isArray(taille)) return "taille invalide";
    for (const cle of ["exMat", "minBrillant", "maxBrillant"]) {
      const v = taille[cle];
      if (v !== undefined && !(Number.isInteger(v) && v >= 1 && v <= 100)) {
        return `Ex. par session invalide (${cle} : ${v}) : nombre entier de 1 à 100`;
      }
    }
    const min = taille.minBrillant ?? 20;
    const max = taille.maxBrillant ?? 60;
    if (min > max) return `Brillant : le minimum (${min}) dépasse le maximum (${max})`;
  }
  return null;
}

// Étiquettes dans l'ordre d'impression : ordreTauro croissant, puis les jobs sans ordre (hors session,
// sans PDF, lancement classique) au rang qu'ils ont dans `ordreFile` (les jobs enfilés), car `jobs`
// (state.jobs.completed) suit l'ordre de fin des workers. Sans rang : ordre d'entrée (tri stable).
function trierPourEtiquettes(jobs, ordreFile = []) {
  const rangs = new Map(ordreFile.map((job, i) => [String(job._id), i]));
  const rang = (job) => rangs.get(String(job?._id)) ?? Infinity;
  const aOrdre = (job) => Number.isFinite(job?.ordreTauro);
  return [...jobs].sort((a, b) => {
    if (aOrdre(a) && aOrdre(b)) return a.ordreTauro - b.ordreTauro;
    if (aOrdre(a)) return -1;
    if (aOrdre(b)) return 1;
    const ra = rang(a);
    const rb = rang(b);
    return ra === rb ? 0 : ra < rb ? -1 : 1;
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

// Dépôt d'un PDF de la file d'attente, avec le journal du job (préfixe [cmd]).
function deposeur(deps, logger) {
  return (
    deps.deposerDepuisAttente ||
    ((job, chemin) =>
      deposerDepuisAttente(job, chemin, {
        log: logger.child ? logger.child({ cmd: job.cmd, client: job.client }) : logger,
      }))
  );
}

async function lancerTauro(req, res, deps) {
  const { state, queueControl, calculerPlan, logger, broadcastWS, progression } = deps;
  const tauro = req.body.tauro || {};

  const invalide = validerOptionsTauro(tauro);
  if (invalide) return res.status(400).json({ error: invalide });

  // Synchrone, avant tout await : un second lancement simultané est refusé ici.
  if (!queueControl.reserver({ tauro: true })) {
    return res.status(409).json({ error: "Un traitement est déjà en cours" });
  }

  // Faux tant que rien n'est lancé : un refus ne touche pas à la progression du lancement précédent.
  let lance = false;
  // File de dépôt dans l'ordre d'impression (fileDepot.js), si `attenteTauro` est renseigné.
  let file = null;
  let erreur;

  try {
    const jobs = queueControl.selectJobs(state.jobs.jobs, req.body.ids);
    if (jobs.length === 0) return res.status(400).json({ error: "Aucun job à lancer" });

    let plan;
    try {
      plan = await calculerPlan(jobs, {
        mode: tauro.mode,
        finition: tauro.finition,
        relancer: tauro.relancer || [],
        taille: tauro.taille,
      });
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

    // PDF de session déposés dans l'ordre d'impression via le dossier d'attente (`attenteTauro`).
    // Teinte masse et stock n'ont pas de PDF : hors de la file, ils ne bloquent personne.
    const dossierAttente = fileDepot.dossierAttente(state.paths);
    const deSession = dossierAttente ? aLancer.filter((j) => j.nomTauro && !j.teinteMasse && !j.useStock) : [];
    const optionsDisque = deSession.length ? { dossierAttente } : undefined;

    const concurrence = deps.getConcurrency();
    let refusDisque = deps.controlerEspaceDisque(aLancer, deps.tmpdir(), concurrence, optionsDisque);
    if (refusDisque && process.env.NODE_ENV === "development" && state.paths.sortieDevSecours) {
      logger.warn(`${refusDisque.error} Sortie déplacée sur ${state.paths.sortieDevSecours}.`);
      const dossierTemporaire = deps.basculerSortieSecours(aLancer, state.paths.sortieDevSecours);
      refusDisque = deps.controlerEspaceDisque(aLancer, dossierTemporaire, concurrence, optionsDisque);
    }
    if (refusDisque) {
      logger.warn(`File non lancée : ${refusDisque.error}`);
      return res.status(507).json(refusDisque);
    }

    state.jobs.completed = [];
    const startTime = performance.now();
    lance = true;

    if (deSession.length) {
      // Sur le job (données Redis) : processJob y copie son PDF, le nettoyage au démarrage l'y retrouve.
      deSession.forEach((j) => {
        j.dossierAttente = dossierAttente;
      });
      const deposer = deposeur(deps, logger);
      file =(deps.creerFileDepot || fileDepot.creerFileDepot)(deSession, { deposer, log: logger, broadcastWS });
      fileDepot.definir(file);
      logger.info(`Dépôt dans l'ordre d'impression : ${deSession.length} PDF via ${dossierAttente}`);
    }

    progression.demarrer(aLancer, { concurrence: deps.getConcurrency, ordreFige: true });
    broadcastWS({ type: "start", startTime });

    const { failed, cancelled } = await queueControl.enqueueRun(
      aLancer,
      { sortFolder: req.body.sortFolder, ip: req.ip },
      file ? { dejaReserve: true, surFin: (id) => file.solder(id) } : { dejaReserve: true },
    );

    if (file) {
      await file.vider();
      const { deposes, ecartes, restes } = file.bilan();
      logger.info(
        `File de dépôt : ${deposes.length} PDF déposé(s) dans l'ordre${ecartes.length ? `, ${ecartes.length} sauté(s)` : ""}${
          restes.length ? `, ${restes.length} resté(s) en attente dans ${dossierAttente}` : ""
        }`,
      );
      if (restes.length) {
        progression.avertir(`${restes.length} PDF resté(s) en attente de dépôt`);
        // Proposés à « Reprendre le dépôt » dans la File (avec ceux d'un arrêt précédent, même dossier).
        const fichiers = await (deps.listerAttente || fileDepot.listerAttente)(dossierAttente).catch(() => restes);
        state.depotsEnAttente = { dossier: dossierAttente, fichiers };
      }
      // Dossier du jour jamais supprimé : sur le partage, un dossier supprimé qu'un autre poste garde
      // ouvert reste « en suppression » et refuse tout accès (EPERM au mkdir de la session suivante).
    }

    const traitees = state.jobs.completed.map(({ cmd, cmd2 }) => (cmd2 > 0 ? `${cmd}+${cmd2}` : cmd));
    const duree = formatDureeMs(performance.now() - startTime);
    const sessions = resumeSessions(plan);
    logger.info(
      `Traitement terminé en ${duree} : ${aLancer.length} job(s), ${failed} en échec, ${cancelled} annulé(s)${
        sessions ? ` · ${sessions}` : ""
      }${traitees.length ? ` · ${traitees.join(", ")}` : ""}`,
    );

    // Par _id : la file garde les objets d'origine, sans les champs Tauro du plan.
    state.jobs.jobs = state.jobs.jobs.filter(
      (job) => !state.jobs.completed.some((completedJob) => completedJob._id === job._id),
    );

    progression.etiquettes();
    try {
      await deps.generateStickersForJobs(trierPourEtiquettes(state.jobs.completed, aLancer));
    } catch (error) {
      logger.error("Génération des étiquettes échouée :", error);
      progression.avertir("Étiquettes non générées");
    }

    progression.finir();
    broadcastWS({ type: "end", endTime: performance.now() });

    return res.status(200).json({ message: "Jobs completed successfully" });
  } catch (error) {
    logger.error("Lancement Tauro échoué :", error);
    erreur = error.message;
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    if (file) fileDepot.effacer();
    if (lance) progression.finir({ erreur });
    queueControl.liberer();
  }
}

/**
 * POST /tauro/reprendre_depot : renvoie au hot folder, dans l'ordre, les PDF de session restés dans
 * le dossier d'attente (hot folder injoignable, arrêt du serveur pendant les envois). Même garde
 * contre le double dépôt (journal, dépôt exclusif). Refusé pendant un traitement.
 */
async function reprendreDepotTauro(req, res, deps) {
  const { state, queueControl, logger, broadcastWS } = deps;
  const enAttente = state.depotsEnAttente;
  if (!enAttente?.dossier) return res.status(400).json({ error: "Aucun PDF en attente de dépôt" });
  if (!queueControl.reserver({ tauro: true })) {
    return res.status(409).json({ error: "Un traitement est déjà en cours" });
  }
  try {
    const bilan = await (deps.reprendreDepot || fileDepot.reprendreDepot)(enAttente.dossier, {
      deposer: deposeur(deps, logger),
      log: logger,
      broadcastWS,
    });
    const restants = await (deps.listerAttente || fileDepot.listerAttente)(enAttente.dossier);
    state.depotsEnAttente = restants.length ? { dossier: enAttente.dossier, fichiers: restants } : null;
    logger.info(
      `Reprise du dépôt : ${bilan.deposes.length} PDF déposé(s) dans l'ordre${
        bilan.ecartes.length ? `, ${bilan.ecartes.length} sauté(s)` : ""
      }${restants.length ? `, ${restants.length} toujours en attente` : ""}`,
    );
    broadcastWS({ type: "update" });
    return res.json({ ...bilan, restants });
  } catch (error) {
    logger.error("Reprise du dépôt Tauro échouée :", error);
    return res.status(500).json({ error: error.message });
  } finally {
    queueControl.liberer();
  }
}

module.exports = { lancerTauro, reprendreDepotTauro, trierPourEtiquettes, validerOptionsTauro, resumeSessions };
