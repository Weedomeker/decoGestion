const dossierService = require("../services/dossierService");

function sendError(res, status, code, message) {
  return res.status(status).json({ error: message, code });
}

exports.listDossiers = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const dossiers = await dossierService.listDossiers({
      limit,
      client: req.query.client,
      commande: req.query.commande,
    });
    res.json(dossiers);
  } catch (error) {
    sendError(res, 500, "DOSSIER_LIST_FAILED", error.message);
  }
};

exports.searchDossiers = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = parseInt(req.query.limit, 10) || 10;
    const suggestions = await dossierService.searchDossiers({ q, limit });
    res.json(suggestions);
  } catch (error) {
    sendError(res, 500, "DOSSIER_SEARCH_FAILED", error.message);
  }
};

async function handleDossierDetail(req, res, view) {
  try {
    const params = { ...req.params, ...req.query };
    const raw = view === "raw" || req.query.raw === "1" || req.query.raw === "true";
    const detail = await dossierService.getDossierDetail({
      seq: params.seq,
      commande: params.commande,
      numero: params.numero,
      q: params.q,
      view,
      raw,
    });
    res.json(detail);
  } catch (error) {
    const status = error.status || 500;
    const code = error.code || "DOSSIER_DETAIL_FAILED";
    sendError(res, status, code, error.message);
  }
}

exports.getDossierDetail = (req, res) => handleDossierDetail(req, res, req.params.view || req.query.view || "summary");

exports.getDossierFull = (req, res) => handleDossierDetail(req, res, "full");

exports.getDossierVisual = (req, res) => handleDossierDetail(req, res, "visuel");

exports.getDossierProduction = (req, res) => handleDossierDetail(req, res, "production");

exports.getDossierLivraison = (req, res) => handleDossierDetail(req, res, "livraison");

exports.getDossierRaw = (req, res) => handleDossierDetail(req, res, "raw");
