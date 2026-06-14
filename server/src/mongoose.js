require("dotenv").config();
const dns = require("dns");
const logger = require("./logger/logger");
const mongoose = require("mongoose");

// Le service DNS de Windows n'écoute pas sur 127.0.0.1:53 (Windows 10+),
// ce qui bloque c-ares (resolver de Node.js) pour les requêtes SRV mongodb+srv://.
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const MONGO_URL =
  process.env.NODE_ENV === "development"
    ? process.env.MONGO_URL + "Test?retryWrites=true&w=majority&appName=Orphea"
    : process.env.MONGO_URL + "DecoKin?retryWrites=true&w=majority&appName=Orphea";

mongoose.connection.on("connected", () => logger.info("MongoDB: connexion établie"));
mongoose.connection.on("disconnected", () => logger.warn("MongoDB: déconnecté"));
mongoose.connection.on("error", (err) => logger.error(`MongoDB: erreur — ${err.message}`));
mongoose.connection.on("reconnected", () => logger.info("MongoDB: reconnexion réussie"));

const MAX_RETRIES = 5;

async function main() {
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      await mongoose.connect(MONGO_URL);
      return;
    } catch (err) {
      attempt++;
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      logger.warn(`MongoDB: tentative ${attempt}/${MAX_RETRIES} dans ${delay / 1000}s — ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  logger.error(`MongoDB: échec après ${MAX_RETRIES} tentatives — serveur démarré en mode dégradé`);
  // Pas de throw — le serveur reste opérationnel sans MongoDB
}

module.exports = main;
