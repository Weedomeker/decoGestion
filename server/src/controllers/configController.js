const { getConfig, saveConfig } = require("../services/configService");

async function postConfig(req, res) {
  const previousConfig = await saveConfig(req.body);
  res.json(previousConfig);
}

function getConfigHandler(req, res) {
  const config = getConfig();

  if (config === null) {
    return res.status(404).send("<center><h4>Fichier de configuration introuvable.</h4></center>");
  }

  if (config === undefined) {
    return res.status(404).send("<center><h4>Fichier de configuration non valide.</h4></center>");
  }

  return res.json(config);
}

module.exports = {
  postConfig,
  getConfig: getConfigHandler,
};
