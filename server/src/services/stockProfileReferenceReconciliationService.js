const logger = require("../logger/logger");
const dossierService = require("../gamesys/services/dossierService");
const { isNumericReference } = require("../gamesys/utils/reference");
const StockProfile = require("../models/StockProfile");
const ConsommationCommande = require("../models/ConsommationCommande");

function resolveRef(r) {
  return r?.reference || r?.articleReference || r?.modele || r?.libelle;
}

// Ne filtre jamais sur articles.ref : celle-ci a pu déjà être corrigée par
// reconcileConsommationReferences.js alors que le StockProfile associé reste cassé.
async function findCandidateNumCmds(libelle, type) {
  const rows = await ConsommationCommande.find(
    { "articles.libelle": libelle, "articles.type": type },
    { numCmd: 1, _id: 0 },
  ).lean();
  return [...new Set(rows.map((r) => r.numCmd))].sort((a, b) => a - b);
}

// Rejoue getDossierDetail sur chaque commande source candidate jusqu'à retrouver, pour ce
// libellé exact, une référence Gamesys fraîche et numérique.
async function resolveFreshReference(stockProfile) {
  const { libelle, type } = stockProfile;
  const numCmds = await findCandidateNumCmds(libelle, type);
  if (numCmds.length === 0) {
    return { ok: false, reason: "Aucune commande source retrouvée dans consommations_commandes pour ce libellé." };
  }

  for (const numCmd of numCmds) {
    let grouped;
    try {
      grouped = await dossierService.getDossierDetail({ commande: String(numCmd), view: "summary" });
    } catch (err) {
      logger.warn(`resolveFreshReference: getDossierDetail échoué pour cmd=${numCmd} (libelle="${libelle}") : ${err.message}`);
      continue;
    }
    const candidates = type === "kit" ? grouped.kitPosesReferences : grouped.profileReferences;
    const match = (candidates || []).find((r) => r.libelle === libelle);
    if (!match) continue;

    const freshRef = resolveRef(match);
    if (freshRef && isNumericReference(freshRef)) {
      return {
        ok: true,
        ref: freshRef,
        modele: match.modele || "",
        codeArticle: match.codeTarif || "",
        famille: match.famille || "",
        sousFamille: match.sousFamille || "",
        sourceNumCmd: numCmd,
      };
    }
  }

  return {
    ok: false,
    reason: `Gamesys ne retourne toujours pas de référence numérique (commandes testées : ${numCmds.join(", ")}).`,
  };
}

async function reconcileStockProfileReferences({ dryRun = false, excludeLibelles = [] } = {}) {
  const brokenDocs = await StockProfile.find({ ref: { $not: /^\d+$/ } }).lean();

  const resolved = [];
  const unresolved = [];

  for (const doc of brokenDocs) {
    if (excludeLibelles.includes(doc.libelle)) {
      unresolved.push({
        id: doc._id,
        ref: doc.ref,
        libelle: doc.libelle,
        type: doc.type,
        raison: "Exclu manuellement de cette réconciliation (nécessite une revue métier).",
      });
      continue;
    }

    const resolution = await resolveFreshReference(doc);
    if (!resolution.ok) {
      unresolved.push({ id: doc._id, ref: doc.ref, libelle: doc.libelle, type: doc.type, raison: resolution.reason });
    } else {
      resolved.push({ doc, resolution });
    }
  }

  const byNewRef = new Map();
  for (const item of resolved) {
    const key = item.resolution.ref;
    if (!byNewRef.has(key)) byNewRef.set(key, []);
    byNewRef.get(key).push(item);
  }

  const brokenIds = new Set(brokenDocs.map((d) => String(d._id)));
  const newRefs = [...byNewRef.keys()];
  const existingTargets = newRefs.length ? await StockProfile.find({ ref: { $in: newRefs } }).lean() : [];
  const existingTargetByRef = new Map(
    existingTargets.filter((t) => !brokenIds.has(String(t._id))).map((t) => [t.ref, t]),
  );

  const actions = [];

  for (const [newRef, items] of byNewRef) {
    const existingTarget = existingTargetByRef.get(newRef);

    if (existingTarget) {
      const stockAjoute = items.reduce((sum, it) => sum + (it.doc.stockDisponible || 0), 0);
      actions.push({
        type: "merge_into_existing",
        targetId: existingTarget._id,
        targetRef: newRef,
        mergedDocs: items.map((it) => ({ id: it.doc._id, ref: it.doc.ref, stockDisponible: it.doc.stockDisponible })),
        stockAjoute,
      });
      if (!dryRun) {
        if (stockAjoute) await StockProfile.updateOne({ _id: existingTarget._id }, { $inc: { stockDisponible: stockAjoute } });
        await StockProfile.deleteMany({ _id: { $in: items.map((it) => it.doc._id) } });
      }
    } else {
      const sorted = [...items].sort((a, b) => String(a.doc._id).localeCompare(String(b.doc._id)));
      const [primary, ...duplicates] = sorted;
      const stockAjoute = duplicates.reduce((sum, it) => sum + (it.doc.stockDisponible || 0), 0);

      actions.push({
        type: duplicates.length ? "update_and_merge_duplicates" : "update",
        primaryId: primary.doc._id,
        ancienRef: primary.doc.ref,
        nouveauRef: newRef,
        modele: primary.resolution.modele,
        codeArticle: primary.resolution.codeArticle,
        mergedDocs: duplicates.map((it) => ({ id: it.doc._id, ref: it.doc.ref, stockDisponible: it.doc.stockDisponible })),
      });

      if (!dryRun) {
        const setFields = { ref: newRef };
        if (primary.resolution.modele && !primary.doc.modele) setFields.modele = primary.resolution.modele;
        if (primary.resolution.codeArticle && !primary.doc.codeArticle) setFields.codeArticle = primary.resolution.codeArticle;
        if (primary.resolution.famille && !primary.doc.famille) setFields.famille = primary.resolution.famille;
        if (primary.resolution.sousFamille && !primary.doc.sousFamille) setFields.sousFamille = primary.resolution.sousFamille;

        const update = { $set: setFields };
        if (stockAjoute) update.$inc = { stockDisponible: stockAjoute };

        await StockProfile.updateOne({ _id: primary.doc._id }, update);
        if (duplicates.length) await StockProfile.deleteMany({ _id: { $in: duplicates.map((it) => it.doc._id) } });
      }
    }
  }

  return { totalCasses: brokenDocs.length, resolus: resolved.length, nonResolus: unresolved.length, actions, unresolved };
}

module.exports = { reconcileStockProfileReferences, resolveFreshReference, findCandidateNumCmds, resolveRef };
