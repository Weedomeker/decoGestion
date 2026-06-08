const jobsRoutes = require("./jobsRoutes");
const configRoutes = require("./configRoutes");
const dossierApiRoutes = require("./dossierApiRoutes");
const stockRoutes = require("./stockRoutes");
const systemRoutes = require("./systemRoutes");

function registerRoutes(app) {
  app.use(jobsRoutes);
  app.use(configRoutes);
  app.use(dossierApiRoutes);
  app.use(stockRoutes);
  app.use(systemRoutes);
}

module.exports = registerRoutes;
