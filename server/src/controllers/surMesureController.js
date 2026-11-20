const path = require("path");
const logger = require("../logger/logger");
const { state } = require("../services/appState");
const { trouverPdfSession } = require("../surMesure/sessionPdf");
const {
  apparierPanneaux,
  complementPdf,
  ecartsGlobaux,
  lignesRestantes,
  numeroterPanneaux,
} = require("../surMesure/apparierPanneaux");
const { lirePages } = require("../surMesure/impositionPool");

const hauteurGabarit = (formatVisu) => {
  const m = String(formatVisu || "").match(/\d+x(\d+)/i);
  return m ? Number(m[1]) * 10 : undefined;
};

// Panneaux d'un sur-mesure : le PDF des créa donne les dimensions, les lignes Gamesys identifient
// et contrôlent. `pdf` choisit le PDF principal quand plusieurs correspondent à la commande ; chaque
// panneau porte son propre `pdf`, car les autres PDF peuvent compléter les lignes restantes.
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

    const lire = (fichier, lignesVisees) =>
      lirePages({
        chemin: fichier.chemin,
        nomFichier: path.parse(fichier.nom).name,
        hauteurAttendue: hauteurGabarit(lignesVisees[0].formatVisu),
      });
    const avecPdf = (panneaux, fichier) => panneaux.map((p) => ({ ...p, pdf: { nom: fichier.nom, chemin: fichier.chemin } }));

    const principal = apparierPanneaux(await lire(pdf, lignes), lignes, path.parse(pdf.nom).name);
    let panneaux = avecPdf(principal.panneaux, pdf);
    let { ecarts } = principal;

    // Un PDF par visuel : les autres PDF de la commande complètent les lignes restées sans panneau.
    for (const autre of candidats.filter((c) => c.nom !== pdf.nom)) {
      const restantes = lignesRestantes(panneaux, lignes);
      if (restantes.length === 0) break;
      try {
        const ajout = complementPdf(await lire(autre, restantes), restantes, path.parse(autre.nom).name);
        if (ajout) panneaux = [...panneaux, ...avecPdf(ajout, autre)];
      } catch (error) {
        logger.warn(`Sur-mesure ${numero} : ${autre.nom} illisible, ignoré (${error.message}).`);
      }
    }
    if (panneaux.some((p) => p.pdf.nom !== pdf.nom)) {
      panneaux = numeroterPanneaux(panneaux);
      ecarts = ecartsGlobaux(panneaux, lignes);
    }
    return res.json({ pdf, candidats: candidats.map((c) => c.nom), panneaux, ecarts });
  } catch (error) {
    logger.error(`Lecture du sur-mesure ${numero} impossible : ${error.message}`);
    return res.status(500).json({ error: `Lecture du PDF sur-mesure impossible : ${error.message}` });
  }
}

module.exports = { getPanneaux, hauteurGabarit };
