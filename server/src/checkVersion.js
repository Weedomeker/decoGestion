const fetch = require("node-fetch");
const logger = require("./logger/logger");
const { state } = require("./services/appState");
const { compareVersions } = require("./utils/version");

// Version de référence = dernière release GitHub (plus le package.json de main, qui n'est pas la prod).
const LATEST_RELEASE_URL = "https://api.github.com/repos/Weedomeker/decoGestion/releases/latest";
const CACHE_MS = 60 * 60 * 1000; // l'API sans authentification est limitée à 60 requêtes/h
const TIMEOUT_MS = 4000; // le Header attend /version : un réseau muet ne doit pas le bloquer longtemps

let cache = null; // { at, promise } — la promesse est partagée par les appels simultanés

async function fetchLatestRelease(fetchImpl) {
  const response = await fetchImpl(LATEST_RELEASE_URL, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "decoGestion" },
    timeout: TIMEOUT_MS,
  });
  if (!response.ok) throw new Error(`GitHub a répondu ${response.status}`);
  const release = await response.json();
  return {
    version: String(release.tag_name || "").replace(/^v/, ""),
    url: release.html_url,
    publishedAt: release.published_at,
  };
}

// Un échec est mis en cache comme un succès : un seul warn par heure si GitHub est injoignable.
// On met la promesse en cache (et non le résultat) pour qu'un appel au démarrage et un /version
// simultanés ne déclenchent qu'une seule requête.
function getLatestRelease(fetchImpl, now) {
  if (cache && now - cache.at < CACHE_MS) return cache.promise;

  const promise = fetchLatestRelease(fetchImpl).catch((error) => {
    logger.warn(`Vérification des mises à jour impossible : ${error.message}`);
    return null;
  });
  cache = { at: now, promise };
  return promise;
}

async function checkVersion({ fetchImpl = fetch, now = Date.now() } = {}) {
  const currentVersion = state.app.version;
  const latest = await getLatestRelease(fetchImpl, now);
  const updateAvailable = Boolean(latest) && compareVersions(latest.version, currentVersion) > 0;

  let message;
  if (!latest) {
    message = `Version ${currentVersion} (vérification des mises à jour indisponible)`;
  } else if (updateAvailable) {
    message = `Mise à jour disponible: ${latest.version} (actuelle: ${currentVersion})`;
  } else {
    message = `Vous avez la dernière version de Decogestion (actuelle: ${currentVersion})`;
  }

  return { currentVersion, latest, updateAvailable, latestVersion: latest?.version, message };
}

checkVersion._resetCache = () => {
  cache = null;
};

module.exports = checkVersion;
