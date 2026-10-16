const logger = require("../logger/logger");

// Coupure réseau vers MongoDB (12/10/2026 : connect ETIMEDOUT pendant ~6 min) : le livrable du job
// était produit mais son historique Deco perdu, laissant le stub Gamesys à "A lancer" alors que la
// commande était déjà imprimée. Seules les erreurs réseau/sélection de serveur sont retentées —
// une erreur de validation ou de doublon échouerait à l'identique.
const NETWORK_ERROR_NAMES = new Set([
  "MongoNetworkError",
  "MongoNetworkTimeoutError",
  "MongoServerSelectionError",
  "MongooseServerSelectionError",
]);
const NETWORK_ERROR_PATTERN = /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|buffering timed out|connection .* closed/i;

const DEFAULT_DELAYS_MS = [5000, 15000, 30000, 60000];

function isMongoNetworkError(err) {
  return Boolean(err) && (NETWORK_ERROR_NAMES.has(err.name) || NETWORK_ERROR_PATTERN.test(err.message || ""));
}

async function withMongoRetry(fn, { label = "opération MongoDB", delaysMs = DEFAULT_DELAYS_MS } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isMongoNetworkError(err) || attempt >= delaysMs.length) throw err;
      const delay = delaysMs[attempt];
      logger.warn(`${label} : MongoDB injoignable (${err.message}), nouvel essai ${attempt + 2}/${delaysMs.length + 1} dans ${delay / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

module.exports = { withMongoRetry, isMongoNetworkError };
