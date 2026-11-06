// Tourne dans un thread à part : un PDF de plus d'un gigaoctet bloquerait le serveur.
const fs = require("fs");
const { chargerSource, mesurerPage, lirePanneau, scriptCut, pdfImpose } = require("./imposition");

const BLOC_LECTURE = 16 * 2 ** 20;
const ESSAIS_LECTURE = 4;

// Lecture par blocs : une coupure réseau passagère ne doit pas faire échouer une source de 1,6 Go.
function lireSource(chemin) {
  const taille = fs.statSync(chemin).size;
  const contenu = Buffer.allocUnsafe(taille);
  const fd = fs.openSync(chemin, "r");
  try {
    for (let pos = 0, essais = 0; pos < taille; ) {
      try {
        pos += fs.readSync(fd, contenu, pos, Math.min(BLOC_LECTURE, taille - pos), pos);
        essais = 0;
      } catch (e) {
        if (++essais >= ESSAIS_LECTURE) throw e;
      }
    }
  } finally {
    fs.closeSync(fd);
  }
  return contenu;
}

async function lirePages({ chemin, nomFichier, hauteurAttendue }) {
  const source = await chargerSource(lireSource(chemin));
  return source.getPages().map((_, i) => {
    try {
      const { page, nom, largeur, hauteur, echelle } = mesurerPage(source, nomFichier, i, { hauteurAttendue });
      return { page, nom, largeur, hauteur, echelle };
    } catch (e) {
      return { page: i, erreur: e.message };
    }
  });
}

async function imposerPanneau({ chemin, nomFichier, page, plaque, hauteurAttendue, sortie, libelle }) {
  const source = await chargerSource(lireSource(chemin));
  const panneau = lirePanneau(source, nomFichier, page, { plaque, hauteurAttendue });
  fs.writeFileSync(sortie, await pdfImpose(source, panneau, libelle));
  const { x0, x1, y0, y1 } = panneau;
  return {
    nom: panneau.nom,
    cut: scriptCut(panneau),
    zone: { x: x0, y: panneau.plaque[1] - y1, largeur: x1 - x0, hauteur: y1 - y0 },
  };
}

module.exports = ({ action, ...tache }) => (action === "lire" ? lirePages(tache) : imposerPanneau(tache));
