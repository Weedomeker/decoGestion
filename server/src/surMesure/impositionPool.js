const Piscina = require("piscina");
const path = require("path");

const MEMOIRE_MAX_MO = 6144;
const INACTIVITE_MS = 30000;

let pool = null;

// Un seul thread : deux PDF de 1,6 Go ouverts en même temps ne tiendraient pas en mémoire.
function getPool() {
  if (!pool) {
    pool = new Piscina({
      filename: path.join(__dirname, "impositionWorker.js"),
      minThreads: 0,
      maxThreads: 1,
      idleTimeout: INACTIVITE_MS,
      resourceLimits: { maxOldGenerationSizeMb: MEMOIRE_MAX_MO },
    });
  }
  return pool;
}

const lirePages = (tache) => getPool().run({ action: "lire", ...tache });
const imposerPanneau = (tache) => getPool().run({ action: "imposer", ...tache });

module.exports = { lirePages, imposerPanneau };
