const logger = require("../logger/logger");
const { getConfig, saveConfig } = require("../services/configService");

async function postConfig(req, res) {
  try {
    const result = await saveConfig(req.body);
    res.json(result);
  } catch (error) {
    logger.error(`postConfig: ${error.message}`);
    res.status(500).json({ error: "Erreur lors de la mise à jour de la configuration" });
  }
}

function getConfigHandler(req, res) {
  try {
    const config = getConfig();
    if (config === null) {
      return res.status(404).json({ error: "Fichier de configuration introuvable" });
    }
    if (config === undefined) {
      return res.status(404).json({ error: "Fichier de configuration invalide" });
    }
    return res.json(config);
  } catch (error) {
    logger.error(`getConfig: ${error.message}`);
    res.status(500).json({ error: "Erreur de lecture de la configuration" });
  }
}

module.exports = {
  postConfig,
  getConfig: getConfigHandler,
};
