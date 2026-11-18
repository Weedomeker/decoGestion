const os = require("os");

// Processeur et mémoire, pour le pied de page. Le CPU se mesure entre deux appels : chaque lecture
// donne la moyenne depuis la précédente (≈ 30 s, au rythme du polling de /health).
// « appli » = le processus Node seul : ImageMagick et Ghostscript tournent dans des processus à part,
// comptés seulement dans « poste ».

let precedent = null;

function totauxCpuPoste() {
  return os.cpus().reduce(
    (acc, { times }) => {
      const total = times.user + times.nice + times.sys + times.idle + times.irq;
      return { total: acc.total + total, inactif: acc.inactif + times.idle };
    },
    { total: 0, inactif: 0 },
  );
}

function echantillon() {
  return { temps: process.hrtime.bigint(), appli: process.cpuUsage(), poste: totauxCpuPoste() };
}

const borner = (pct) => Math.min(100, Math.max(0, Math.round(pct)));

function lireRessources() {
  const courant = echantillon();
  const avant = precedent || courant;
  precedent = courant;

  const ecoulementUs = Number(courant.temps - avant.temps) / 1000;
  const appliUs = courant.appli.user + courant.appli.system - (avant.appli.user + avant.appli.system);
  const posteTotal = courant.poste.total - avant.poste.total;
  const posteInactif = courant.poste.inactif - avant.poste.inactif;

  // Premier appel : pas d'intervalle, CPU inconnu.
  const mesurable = ecoulementUs > 0 && posteTotal > 0;
  const memTotale = os.totalmem();

  return {
    appli: {
      // En % de la machine entière (tous cœurs), comme le Gestionnaire des tâches.
      cpu: mesurable ? borner((appliUs / ecoulementUs / os.cpus().length) * 100) : null,
      ram: process.memoryUsage().rss,
    },
    poste: {
      cpu: mesurable ? borner((1 - posteInactif / posteTotal) * 100) : null,
      ramUtilisee: memTotale - os.freemem(),
      ramTotale: memTotale,
    },
  };
}

module.exports = { lireRessources };
