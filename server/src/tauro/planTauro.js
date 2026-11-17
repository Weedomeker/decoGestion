/*
  Plan de lancement Tauro : sélection de jobs decoGestion -> sessions, hors session, restants, bloqués.
  construirePlan est pure (aucune E/S) ; calculerPlan lit le journal en base.
*/
"use strict";
const crypto = require("node:crypto");
const lancement = require("./lancement-tauro");
const regles = require("./regles-tauro");
const { ligneDepuisJob } = require("./depuisJob");
const { entreesPourLancement } = require("./journalTauro");

const finitionNom = (s) => (/brillant/i.test(String(s || "")) ? "BRI" : "MAT");
const idDe = (l) => String(l.source?._id ?? "");

function elementBloque(x) {
  return { id: idDe(x.ligne), cle: x.cle, cmd: x.cmd, ex: x.ex, decor: x.decor, raison: x.raison };
}

function construirePlan(jobs, journal, o = {}) {
  const mode = o.mode || "session";
  const finition = o.finition ? String(o.finition).toUpperCase() : "MAT";
  const relancer = (o.relancer || []).map(String);
  const date = o.date;

  const toutes = jobs.map(ligneDepuisJob);
  const lignes = toutes.filter((l) => !l.sansPdf);
  const sansPdf = toutes
    .filter((l) => l.sansPdf)
    .map((l) => ({ id: idDe(l), cmd: l.source.cmd, ex: l.source.ex, visuel: l.source.visuel }));

  const prep = lancement.preparerLancement(lignes, { date, journal, mode, finition, relancer });
  const alertes = [...prep.alertes];
  const bloques = prep.bloques.map(elementBloque);

  // Alerte de finition : celle du nom du visuel diffère de la référence
  for (const l of lignes) {
    const ref = l.source.refDbData?.finition;
    if (!ref) continue;
    const dunom = finitionNom(l.finition);
    const deref = finitionNom(ref);
    if (dunom !== deref) alertes.push(`${l.cmd} : finition du nom (${dunom}) ≠ référence (${deref})`);
  }

  const copie = (l, j, extra) => ({
    ...l.source,
    ...extra,
    clesTauro: l.clesJournal && l.clesJournal.length ? [...l.clesJournal] : [l.cle],
    signatureTauro: lancement.signature(j),
    hfTauro: j.hf,
  });

  const sessions = [];
  const deSession = [];
  for (const s of prep.sessions) {
    sessions.push({
      code: s.code,
      fin: s.fin,
      ex: s.ex,
      depart: s.depart,
      dernier: s.dernier,
      jobs: s.jobs.map((j, k) => ({
        id: idDe(s.lignes[k]),
        nom: j.job,
        cmd: j.cmd,
        ex: j.ex,
        format: j.format,
        blanc: j.blanc,
        hf: j.hf,
      })),
    });
    s.jobs.forEach((j, k) =>
      deSession.push(copie(s.lignes[k], j, { nomTauro: j.job, sessionTauro: s.code, ordreTauro: j.ordre })),
    );
  }
  deSession.sort((a, b) => a.ordreTauro - b.ordreTauro);

  const horsSession = [];
  const deHors = [];
  for (const h of prep.horsSession) {
    const l = h.ligne;
    if (!l.nomOrigine) {
      bloques.push({
        id: idDe(l),
        cle: h.cle,
        cmd: h.cmd,
        ex: h.ex,
        decor: h.decor,
        raison: "nom d'origine introuvable",
      });
      continue;
    }
    horsSession.push({ id: idDe(l), nom: h.job, cmd: h.cmd, ex: h.ex, fin: h.fin, hf: h.hf });
    deHors.push(copie(l, h, { horsSession: true, nomOrigine: l.nomOrigine }));
  }

  const deSansPdf = toutes
    .filter((l) => l.sansPdf)
    .map((l) => ({
      ...l.source,
      clesTauro: l.clesJournal && l.clesJournal.length ? [...l.clesJournal] : [l.cle],
      signatureTauro: lancement.signature(regles.job(l, "")),
      hfTauro: regles.job(l, "").hf,
    }));

  const aLancer = [...deSession, ...deHors, ...deSansPdf];
  const empreinte = crypto
    .createHash("sha1")
    .update(
      JSON.stringify([
        mode,
        finition,
        [...relancer].sort(),
        aLancer.map((j) => [j._id, j.nomTauro || j.nomOrigine || "", j.ex]),
      ]),
    )
    .digest("hex");

  return {
    mode,
    finition,
    date,
    sessions,
    horsSession,
    restants: prep.restants.map(elementBloque),
    ignores: prep.ignores.map(elementBloque),
    bloques,
    alertes: [...new Set(alertes)],
    sansPdf,
    aLancer,
    empreinte,
  };
}

async function calculerPlan(jobs, opts = {}) {
  const date = opts.date || new Date().toLocaleDateString("sv-SE");
  const lignes = jobs.map(ligneDepuisJob);
  // Le journal range le jour en AAAA-MM-JJ local (inscrire), pas en code de session « S1711 ».
  const journal = await entreesPourLancement(lignes, date);
  return construirePlan(jobs, journal, { ...opts, date });
}

function serialiser(plan) {
  const { aLancer, ...reste } = plan;
  return reste;
}

module.exports = { construirePlan, calculerPlan, serialiser };
