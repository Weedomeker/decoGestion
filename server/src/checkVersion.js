const fetch = require("node-fetch");
const logger = require("./logger/logger");
const { state } = require("./services/appState");
const { compareVersions } = require("./utils/version");

// Version de référence = dernière release GitHub (plus le package.json de main, qui n'est pas la prod).
const LATEST_RELEASE_URL = "https://api.github.com/repos/Weedomeker/decoGestion/releases/latest";
const CACHE_MS = 60 * 60 * 1000; // l'API sans authentification est limitée à 60 requêtes/h

let cache = null; // { at, latest }

async function fetchLatestRelease(fetchImpl) {
  const response = await fetchImpl(LATEST_RELEASE_URL, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "decoGestion" },
    timeout: 10000,
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
async function getLatestRelease(fetchImpl, now) {
  if (cache && now - cache.at < CACHE_MS) return cache.latest;

  let latest = null;
  try {
    latest = await fetchLatestRelease(fetchImpl);
  } catch (error) {
    logger.warn(`Vérification des mises à jour impossible : ${error.message}`);
  }
  cache = { at: now, latest };
  return latest;
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
