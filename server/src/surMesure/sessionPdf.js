const fs = require("fs").promises;

const BAT_RE = /[\s_-]BAT\d*\.pdf$/i;

// Chemin à barres obliques : addJob en tire le nom de fichier, et un chemin réseau garde son // initial.
const dansDossier = (dossier, nom) => `${dossier.replace(/\\/g, "/").replace(/\/+$/, "")}/${nom}`;

function moisRecherches(date = new Date()) {
  const prefixe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return [prefixe(date), prefixe(new Date(date.getFullYear(), date.getMonth() - 1, 1))];
}

async function pdfDeCommande(dossier, numero) {
  const debut = new RegExp(`^${numero}(?!\\d)`);
  const entrees = await fs.readdir(dossier, { withFileTypes: true });
  const noms = entrees
    .filter((e) => e.isFile() && debut.test(e.name) && /\.pdf$/i.test(e.name) && !BAT_RE.test(e.name))
    .map((e) => e.name);
  return Promise.all(
    noms.map(async (nom) => {
      const chemin = dansDossier(dossier, nom);
      const { mtimeMs } = await fs.stat(chemin);
      return { nom, chemin, mtimeMs };
    }),
  );
}

// `racine` peut viser le dossier des sessions (sous-dossiers « 2026-11 NOVEMBRE ») ou directement
// un dossier de PDF : les deux sont parcourus. Le PDF le plus récent vient en premier.
async function trouverPdfSession(racine, numero, date = new Date()) {
  const mois = moisRecherches(date);
  const entrees = await fs.readdir(racine, { withFileTypes: true });
  const dossiers = [
    racine,
    ...entrees
      .filter((e) => e.isDirectory() && mois.some((m) => e.name.startsWith(m)))
      .map((e) => dansDossier(racine, e.name)),
  ];
  const trouves = (await Promise.all(dossiers.map((d) => pdfDeCommande(d, numero)))).flat();
  return trouves.sort((a, b) => b.mtimeMs - a.mtimeMs).map(({ nom, chemin }) => ({ nom, chemin }));
}

module.exports = { trouverPdfSession, moisRecherches, dansDossier };
