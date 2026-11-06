const fs = require("fs");
const path = require("path");

const GO = 2 ** 30;
// Réserve pour les JPG, miniatures, .cut et étiquettes, et pour ne pas remplir le disque à ras bord.
const MARGE_OCTETS = 512 * 2 ** 20;
// Temporaire : le PDF lui-même, plus la copie entière qu'ImageMagick en fait pour le JPG.
const COPIES_TEMPORAIRES = 2;

const go = (octets) => (octets / GO).toFixed(1).replace(".", ",");

// Taille des PDF à produire : un PDF de sortie pèse autant que sa source, et un amalgame que ses
// deux sources. Teinte masse et prise en stock n'impriment rien.
function taillesPdf(jobs, tailleFichier) {
  return jobs
    .filter((job) => !job.teinteMasse && !job.useStock)
    .map((job) => ({
      destination: job.writePath,
      taille: tailleFichier(job.visuPath) + (job.visuPath2 ? tailleFichier(job.visuPath2) : 0),
    }));
}

// Chaque PDF passe par le dossier temporaire, au plus `concurrence` à la fois, puis reste en sortie
// (le hot folder se vide, mais rien ne garantit que le RIP suive le rythme).
function besoinsParDossier(tailles, dossierTemporaire, concurrence) {
  const pic = [...tailles.map((t) => t.taille)]
    .sort((a, b) => b - a)
    .slice(0, concurrence)
    .reduce((somme, taille) => somme + taille, 0);
  const besoins = new Map([[dossierTemporaire, pic * COPIES_TEMPORAIRES]]);
  tailles.forEach(({ destination, taille }) => {
    besoins.set(destination, (besoins.get(destination) || 0) + taille);
  });
  return besoins;
}

// Regroupe par disque : deux dossiers du même disque cumulent leurs besoins.
// `disqueDe` retourne { racine, libre } ou null si le dossier ne peut pas être mesuré.
function refusEspaceDisque(besoins, disqueDe) {
  const disques = new Map();
  besoins.forEach((besoin, dossier) => {
    const disque = disqueDe(dossier);
    if (!disque) return;
    const cumul = disques.get(disque.racine) || { ...disque, besoin: MARGE_OCTETS };
    cumul.besoin += besoin;
    disques.set(disque.racine, cumul);
  });
  const plein = [...disques.values()].find(({ libre, besoin }) => libre < besoin);
  if (!plein) return null;
  return {
    code: "DISQUE_PLEIN",
    error: `Espace disque insuffisant sur ${plein.racine} : ${go(plein.besoin)} Go nécessaires, ${go(plein.libre)} Go libres. Libérez de la place avant de lancer la file.`,
  };
}

// Le dossier de sortie peut ne pas encore exister : on mesure son plus proche parent.
function disqueDe(dossier) {
  let courant = path.resolve(dossier);
  while (!fs.existsSync(courant) && path.dirname(courant) !== courant) courant = path.dirname(courant);
  try {
    const { bavail, bsize } = fs.statfsSync(courant);
    return { racine: path.parse(fs.realpathSync.native(courant)).root, libre: bavail * bsize };
  } catch {
    return null; // partage injoignable : le job remontera lui-même l'erreur
  }
}

function tailleFichier(chemin) {
  try {
    return fs.statSync(chemin).size;
  } catch {
    return 0;
  }
}

function controlerEspaceDisque(jobs, dossierTemporaire, concurrence) {
  const besoins = besoinsParDossier(taillesPdf(jobs, tailleFichier), dossierTemporaire, concurrence);
  return refusEspaceDisque(besoins, disqueDe);
}

// En dev, sur un poste au disque trop juste : temporaires, copies d'ImageMagick et sortie partent sur `secours`.
// Retourne le nouveau dossier temporaire.
function basculerSortieSecours(jobs, secours) {
  const dossierTemporaire = path.join(secours, "tmp");
  jobs.forEach((job) => {
    job.writePath = path.join(secours, path.basename(job.writePath));
    job.dossierTemporaire = dossierTemporaire;
  });
  return dossierTemporaire;
}

module.exports = { controlerEspaceDisque, basculerSortieSecours, taillesPdf, besoinsParDossier, refusEspaceDisque, disqueDe };
