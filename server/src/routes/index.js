const jobsRoutes = require("./jobsRoutes");
const configRoutes = require("./configRoutes");
const browseRoutes = require("./browseRoutes");
const dossierApiRoutes = require("./dossierApiRoutes");
const stockRoutes = require("./stockRoutes");
const systemRoutes = require("./systemRoutes");
const healthRoutes = require("./healthRoutes");
const referencesRoutes = require("./referencesRoutes");
const gamesysDossierRoutes = require("../gamesys/routes/dossierRoutes");
const gamesysOrderRoutes = require("../gamesys/routes/orderRoutes");

function registerRoutes(app) {
  app.use(healthRoutes);
  app.use(jobsRoutes);
  app.use(configRoutes);
  app.use(browseRoutes);
  app.use(dossierApiRoutes);
  app.use(stockRoutes);
  app.use(systemRoutes);
  app.use(referencesRoutes);
  app.use("/api/dossiers", gamesysDossierRoutes);
  app.use("/api/orders", gamesysOrderRoutes);
}

module.exports = registerRoutes;
