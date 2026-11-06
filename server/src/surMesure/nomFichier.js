const path = require("path");

const cm = (mm) => String(mm / 10).replace(".", ",");
const sansCaracteresInterdits = (texte) => texte.replace(/[\\/:*?"<>|]/g, " ");

// Taille réelle du panneau, en cm : "80x210", "60,5x200".
const formatReel = ({ largeur, hauteur }) => `${cm(largeur)}x${cm(hauteur)}`;

// Numéro du panneau dans le PDF : "169580-2 LM AMIENS" donne 2.
const rangPanneau = (nom) => nom.match(/^\d+-(\d+)\s/)?.[1] || "";

// Même forme que les autres jobs, avec le format fini réel du panneau à la place de la plaque :
// "169580 - LM AMIENS - 80x210 - JARDIN SECRET GAUCHE MAT". Le .cut et le QR gardent le nom du
// panneau : c'est par lui que la table retrouve la découpe.
function baseFichierSurMesure({ cmd, client, ville, panneau, orientation, jobs = [] }) {
  const visuel = [panneau.deco || panneau.nom, orientation, panneau.vernis].filter(Boolean).join(" ");
  const base = `${cmd} - ${client} ${ville ? `${ville.toUpperCase()} - ` : ""}${formatReel(panneau)} - ${visuel}`;
  // Deux panneaux identiques auraient le même nom, et le second écraserait le premier au hot folder.
  const doublon = jobs.some((j) => j.smBase === base && j.smPage !== panneau.page);
  const rang = rangPanneau(panneau.nom);
  return sansCaracteresInterdits(rang && (!orientation || doublon) ? `${base} ${rang}` : base);
}

// Miniature des étiquettes : le panneau seul, debout, dans le dossier du jour.
const cheminApercuSurMesure = (dossierJour, base) => path.join(dossierJour, "Apercus", `${base}.jpg`);

module.exports = { formatReel, baseFichierSurMesure, cheminApercuSurMesure };
