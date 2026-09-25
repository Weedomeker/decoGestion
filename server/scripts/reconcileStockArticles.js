/**
 * Script ponctuel : réconciliation stock_profiles ↔ consommations_commandes.
 *
 * Détecte les références présentes dans consommations_commandes.articles mais absentes du
 * catalogue stock_profiles (ex: upsert StockArticle ayant échoué silencieusement au moment de
 * saveProfilsKits — la consommation avait quand même été enregistrée). Ne touche pas Gamesys,
 * uniquement une comparaison Mongo → Mongo.
 *
 * Usage :
 *   node server/scripts/reconcileStockArticles.js            (dry-run : affiche sans créer)
 *   node server/scripts/reconcileStockArticles.js --apply    (crée réellement les StockArticle manquants)
 *
 * Respecte NODE_ENV comme le reste de l'app (server/src/mongoose.js) :
 * NODE_ENV=development -> base "Test", sinon -> base "DecoKin" (prod).
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const { reconcileStockArticlesFromConsommations } = require("../src/services/stockArticleReconciliationService");

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`NODE_ENV=${process.env.NODE_ENV || "(non défini)"} — connexion MongoDB...`);
  await connectMongo();
  if (mongoose.connection.readyState !== 1) {
    console.error("MongoDB indisponible, abandon.");
    process.exit(1);
  }
  console.log(`Connecté à la base "${mongoose.connection.name}".`);

  const resultat = await reconcileStockArticlesFromConsommations({ dryRun: !apply });

  console.log("\nRésumé :");
  console.log(`  Références orphelines détectées : ${resultat.orphelinsDetectes}`);
  if (apply) {
    console.log(`  StockArticle créés               : ${resultat.crees}`);
  } else {
    console.log("\nMode dry-run — aucune donnée écrite. Relancer avec --apply pour créer réellement.");
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error("Erreur fatale :", error);
  process.exit(1);
});
