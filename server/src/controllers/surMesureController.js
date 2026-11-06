const path = require("path");
const logger = require("../logger/logger");
const { state } = require("../services/appState");
const { trouverPdfSession } = require("../surMesure/sessionPdf");
const { apparierPanneaux } = require("../surMesure/apparierPanneaux");
const { lirePages } = require("../surMesure/impositionPool");

const hauteurGabarit = (formatVisu) => {
  const m = String(formatVisu || "").match(/\d+x(\d+)/i);
  return m ? Number(m[1]) * 10 : undefined;
};

// Panneaux d'un sur-mesure : le PDF des créa donne les dimensions, les lignes Gamesys identifient
// et contrôlent. `pdf` choisit un fichier quand plusieurs correspondent à la commande.
async function getPanneaux(req, res) {
  const numero = String(req.body.numero || "").trim();
  const lignes = Array.isArray(req.body.lignes) ? req.body.lignes : [];

  if (!/^\d+$/.test(numero) || lignes.length === 0) {
    return res.status(400).json({ error: "Numéro de commande ou lignes manquants." });
  }
  if (!state.paths.sourceSM) {
    return res.status(503).json({ error: "Dossier source sur-mesure non configuré (clé SM de config.json)." });
  }

  try {
    const candidats = await trouverPdfSession(state.paths.sourceSM, numero);
    const pdf = candidats.find((c) => c.nom === req.body.pdf) || candidats[0];
    if (!pdf) return res.json({ pdf: null, candidats: [], panneaux: [], ecarts: [] });

    const nomFichier = path.parse(pdf.nom).name;
    const pages = await lirePages({
      chemin: pdf.chemin,
      nomFichier,
      hauteurAttendue: hauteurGabarit(lignes[0].formatVisu),
    });
    return res.json({ pdf, candidats: candidats.map((c) => c.nom), ...apparierPanneaux(pages, lignes, nomFichier) });
  } catch (error) {
    logger.error(`Lecture du sur-mesure ${numero} impossible : ${error.message}`);
    return res.status(500).json({ error: `Lecture du PDF sur-mesure impossible : ${error.message}` });
  }
}

module.exports = { getPanneaux, hauteurGabarit };
