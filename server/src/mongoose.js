require("dotenv").config();
const dns = require("dns");
const logger = require("../src/logger/logger");
const mongoose = require("mongoose");

// Le service DNS de Windows n'écoute pas sur 127.0.0.1:53 (Windows 10+),
// ce qui bloque c-ares (resolver de Node.js) pour les requêtes SRV mongodb+srv://.
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const main = async () => {
  await mongoose.connect(
    process.env.NODE_ENV === "development"
      ? process.env.MONGO_URL + "Test?retryWrites=true&w=majority&appName=Orphea"
      : process.env.MONGO_URL + "DecoKin?retryWrites=true&w=majority&appName=Orphea",
  );
  logger.info("Mongoose connecté !");
};

module.exports = main;
